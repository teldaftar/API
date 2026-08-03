import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  BusinessException,
  ErrorCode,
  PaginatedResult,
  normalizeUzPhone,
  paginate,
  localDateStartUtc,
  localDateEndExclusiveUtc,
  todayLocalDateString,
} from '../common';
import { Accessory } from '../accessories/entities/accessory.entity';
import { Debt, DebtStatus } from '../debts/entities/debt.entity';
import { Phone, PhoneStatus } from '../phones/entities/phone.entity';
import { DebtPayment } from '../debts/entities/debt-payment.entity';
import { CreateReturnDto } from './dto/create-return.dto';
import { DebtInputDto } from './dto/debt-input.dto';
import { buildDebtSummary, SaleResponseDto } from './dto/sale-response.dto';
import { QuerySalesDto } from './dto/query-sales.dto';
import { SellAccessoryDto } from './dto/sell-accessory.dto';
import { SellPhoneDto } from './dto/sell-phone.dto';
import { SaleCounter } from './entities/sale-counter.entity';
import { SaleItem, SaleItemType } from './entities/sale-item.entity';
import { SaleReturn } from './entities/sale-return.entity';
import { Sale, SaleStatus, SaleType } from './entities/sale.entity';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItems: Repository<SaleItem>,
    @InjectRepository(SaleReturn)
    private readonly saleReturns: Repository<SaleReturn>,
    @InjectRepository(Debt) private readonly debts: Repository<Debt>,
    @InjectRepository(DebtPayment)
    private readonly debtPayments: Repository<DebtPayment>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Selling
  // ---------------------------------------------------------------------------

  async sellPhone(
    shopId: string,
    userId: string,
    dto: SellPhoneDto,
  ): Promise<SaleResponseDto> {
    const debt = dto.debt
      ? this.validateDebt(dto.debt, dto.price)
      : null;

    const saleId = await this.dataSource.transaction(async (manager) => {
      const phone = await manager
        .getRepository(Phone)
        .createQueryBuilder('phone')
        .setLock('pessimistic_write')
        .where('phone.id = :id AND phone.shop_id = :shopId', {
          id: dto.phoneId,
          shopId,
        })
        .andWhere('phone.deleted_at IS NULL')
        .getOne();

      if (!phone) {
        throw BusinessException.notFound('Phone not found');
      }
      if (phone.status !== PhoneStatus.IN_STOCK) {
        throw BusinessException.conflict(
          ErrorCode.PHONE_ALREADY_SOLD,
          'This phone has already been sold',
        );
      }

      const paidAmount = debt ? dto.price - debt.amount : dto.price;

      const sale = await manager.getRepository(Sale).save({
        shopId,
        code: await this.nextSaleCode(manager, shopId),
        type: SaleType.PHONE,
        totalAmount: dto.price,
        paidAmount,
        debtAmount: debt ? debt.amount : 0,
        status: SaleStatus.COMPLETED,
        note: dto.note ?? null,
        customerName:
          dto.customerName?.trim() || debt?.customerName?.trim() || null,
        customerPhone: dto.customerPhone?.trim() || debt?.customerPhone || null,
        soldBy: userId,
      });

      await manager.getRepository(SaleItem).save({
        shopId,
        saleId: sale.id,
        itemType: SaleItemType.PHONE,
        phoneId: phone.id,
        accessoryId: null,
        quantity: 1,
        unitPrice: dto.price,
        costPrice: phone.purchasePrice,
        lineTotal: dto.price,
        returnedQuantity: 0,
      });

      phone.status = PhoneStatus.SOLD;
      await manager.getRepository(Phone).save(phone);

      if (debt) {
        await this.createDebt(manager, shopId, sale.id, debt);
      }

      return sale.id;
    });

    return this.findOne(shopId, saleId);
  }

  async sellAccessory(
    shopId: string,
    userId: string,
    dto: SellAccessoryDto,
  ): Promise<SaleResponseDto> {
    const saleId = await this.dataSource.transaction(async (manager) => {
      const accessory = await manager
        .getRepository(Accessory)
        .createQueryBuilder('a')
        .setLock('pessimistic_write')
        .where('a.id = :id AND a.shop_id = :shopId', {
          id: dto.accessoryId,
          shopId,
        })
        .andWhere('a.deleted_at IS NULL')
        .getOne();

      if (!accessory) {
        throw BusinessException.notFound('Accessory not found');
      }

      if (dto.quantity > accessory.quantity) {
        throw BusinessException.conflict(
          ErrorCode.INSUFFICIENT_STOCK,
          'Not enough stock for this sale',
          { available: accessory.quantity },
        );
      }

      const unitPrice = dto.unitPrice ?? accessory.salePrice;
      if (unitPrice === null || unitPrice === undefined) {
        throw BusinessException.badRequest(
          ErrorCode.PRICE_REQUIRED,
          'A unit price is required (no default sale price on the accessory)',
        );
      }

      const lineTotal = this.round2(unitPrice * dto.quantity);
      const debt = dto.debt ? this.validateDebt(dto.debt, lineTotal) : null;
      const paidAmount = debt ? lineTotal - debt.amount : lineTotal;

      const sale = await manager.getRepository(Sale).save({
        shopId,
        code: await this.nextSaleCode(manager, shopId),
        type: SaleType.ACCESSORY,
        totalAmount: lineTotal,
        paidAmount,
        debtAmount: debt ? debt.amount : 0,
        status: SaleStatus.COMPLETED,
        note: dto.note ?? null,
        customerName:
          dto.customerName?.trim() || debt?.customerName?.trim() || null,
        customerPhone: dto.customerPhone?.trim() || debt?.customerPhone || null,
        soldBy: userId,
      });

      await manager.getRepository(SaleItem).save({
        shopId,
        saleId: sale.id,
        itemType: SaleItemType.ACCESSORY,
        phoneId: null,
        accessoryId: accessory.id,
        quantity: dto.quantity,
        unitPrice,
        costPrice: accessory.purchasePrice,
        lineTotal,
        returnedQuantity: 0,
      });

      accessory.quantity -= dto.quantity;
      await manager.getRepository(Accessory).save(accessory);

      if (debt) {
        await this.createDebt(manager, shopId, sale.id, debt);
      }

      return sale.id;
    });

    return this.findOne(shopId, saleId);
  }

  // ---------------------------------------------------------------------------
  // Returns
  // ---------------------------------------------------------------------------

  async createReturn(
    shopId: string,
    userId: string,
    saleId: string,
    dto: CreateReturnDto,
  ): Promise<SaleResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const sale = await manager
        .getRepository(Sale)
        .createQueryBuilder('sale')
        .setLock('pessimistic_write')
        .where('sale.id = :saleId AND sale.shop_id = :shopId', {
          saleId,
          shopId,
        })
        .getOne();
      if (!sale) {
        throw BusinessException.notFound('Sale not found');
      }

      const item = await manager.getRepository(SaleItem).findOne({
        where: { id: dto.saleItemId, saleId: sale.id, shopId },
      });
      if (!item) {
        throw BusinessException.notFound('Sale item not found');
      }

      const remaining = item.quantity - item.returnedQuantity;
      if (dto.quantity > remaining) {
        throw BusinessException.conflict(
          ErrorCode.RETURN_EXCEEDS_SOLD,
          'Return quantity exceeds what remains sold',
          { remaining },
        );
      }

      // Proportional sold amount for the returned units is the default cap.
      const proportional = this.round2(item.unitPrice * dto.quantity);
      const amount = dto.amount ?? proportional;
      if (amount > proportional) {
        throw BusinessException.badRequest(
          ErrorCode.RETURN_AMOUNT_EXCEEDS_SOLD,
          'Refund amount cannot exceed the proportional sold amount',
          { maxAmount: proportional },
        );
      }

      await manager.getRepository(SaleReturn).save({
        shopId,
        saleId: sale.id,
        saleItemId: item.id,
        quantity: dto.quantity,
        amount,
        reason: dto.reason,
        createdBy: userId,
      });

      item.returnedQuantity += dto.quantity;
      await manager.getRepository(SaleItem).save(item);

      // Restore stock.
      if (item.itemType === SaleItemType.PHONE && item.phoneId) {
        await manager
          .getRepository(Phone)
          .update(
            { id: item.phoneId, shopId },
            { status: PhoneStatus.IN_STOCK },
          );
      } else if (item.itemType === SaleItemType.ACCESSORY && item.accessoryId) {
        await manager
          .getRepository(Accessory)
          .increment(
            { id: item.accessoryId, shopId },
            'quantity',
            dto.quantity,
          );
      }

      // Reduce an OPEN debt by the refunded amount, floored at 0.
      const debt = await manager.getRepository(Debt).findOne({
        where: { saleId: sale.id, shopId },
      });
      if (debt && debt.status === DebtStatus.OPEN) {
        const newAmount = this.round2(Math.max(0, debt.amount - amount));
        debt.amount = newAmount;
        if (newAmount === 0) {
          debt.status = DebtStatus.CANCELLED;
        }
        await manager.getRepository(Debt).save(debt);
      }

      // Recompute sale status from all items.
      const items = await manager.getRepository(SaleItem).find({
        where: { saleId: sale.id },
      });
      const fullyReturned = items.every(
        (i) => i.returnedQuantity >= i.quantity,
      );
      const anyReturned = items.some((i) => i.returnedQuantity > 0);
      sale.status = fullyReturned
        ? SaleStatus.RETURNED
        : anyReturned
          ? SaleStatus.PARTIALLY_RETURNED
          : SaleStatus.COMPLETED;
      await manager.getRepository(Sale).save(sale);
    });

    return this.findOne(shopId, saleId);
  }

  async listReturns(shopId: string, saleId: string): Promise<SaleReturn[]> {
    const sale = await this.sales.findOne({ where: { id: saleId, shopId } });
    if (!sale) {
      throw BusinessException.notFound('Sale not found');
    }
    return this.saleReturns.find({
      where: { saleId, shopId },
      order: { createdAt: 'DESC' },
    });
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async findAll(
    shopId: string,
    query: QuerySalesDto,
  ): Promise<PaginatedResult<SaleResponseDto>> {
    // Step 1: filtered + paginated sale IDs (avoids row multiplication).
    const idQb = this.sales
      .createQueryBuilder('sale')
      .select('sale.id', 'id')
      .addSelect('sale.sold_at', 'sold_at')
      .where('sale.shop_id = :shopId', { shopId });

    if (query.type) {
      idQb.andWhere('sale.type = :type', { type: query.type });
    }
    if (query.from) {
      idQb.andWhere('sale.sold_at >= :from', {
        from: localDateStartUtc(query.from),
      });
    }
    if (query.to) {
      idQb.andWhere('sale.sold_at < :toExclusive', {
        toExclusive: localDateEndExclusiveUtc(query.to),
      });
    }
    if (query.isDebt !== undefined) {
      const sub = (qb: typeof idQb) =>
        qb
          .subQuery()
          .select('d.sale_id')
          .from(Debt, 'd')
          .where('d.shop_id = :shopId')
          .getQuery();
      if (query.isDebt) {
        idQb.andWhere(`sale.id IN ${sub(idQb)}`);
      } else {
        idQb.andWhere(`sale.id NOT IN ${sub(idQb)}`);
      }
    }
    if (query.search) {
      idQb.andWhere(
        new Brackets((w) => {
          w.where('sale.code ILIKE :search', {
            search: `%${query.search}%`,
          }).orWhere(
            `sale.id IN (
              SELECT si.sale_id FROM sale_items si
              LEFT JOIN phones p ON p.id = si.phone_id
              LEFT JOIN accessories acc ON acc.id = si.accessory_id
              WHERE si.shop_id = :shopId
                AND (p.name ILIKE :search OR p.imei ILIKE :search OR acc.name ILIKE :search)
            )`,
            { search: `%${query.search}%`, shopId },
          );
        }),
      );
    }

    const total = await idQb.getCount();
    const rows = await idQb
      .orderBy('sale.sold_at', 'DESC')
      .offset(query.skip)
      .limit(query.limit)
      .getRawMany<{ id: string }>();

    const ids = rows.map((r) => r.id);
    const data = await this.hydrateSales(shopId, ids);
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(shopId: string, id: string): Promise<SaleResponseDto> {
    const [sale] = await this.hydrateSales(shopId, [id]);
    if (!sale) {
      throw BusinessException.notFound('Sale not found');
    }
    return sale;
  }

  /**
   * Load full sale rows (items + product snapshots + debt) for a set of ids,
   * preserving the given id order. Batches product/debt lookups to avoid N+1.
   */
  private async hydrateSales(
    shopId: string,
    ids: string[],
  ): Promise<SaleResponseDto[]> {
    if (ids.length === 0) return [];

    const sales = await this.sales.find({ where: { id: In(ids), shopId } });
    const items = await this.saleItems.find({
      where: { saleId: In(ids), shopId },
    });
    const debts = await this.debts.find({
      where: { saleId: In(ids), shopId },
    });

    // Refunds per sale item, so profit can account for amounts retained on
    // partial returns (customer paid X, got refunded less — the shop keeps
    // the difference while the goods return to stock).
    const returns = await this.saleReturns.find({
      where: { saleId: In(ids), shopId },
    });
    const refundByItem = new Map<string, number>();
    for (const r of returns) {
      refundByItem.set(
        r.saleItemId,
        (refundByItem.get(r.saleItemId) ?? 0) + r.amount,
      );
    }

    // Payment ledger for those debts, grouped by debt id (newest first).
    const debtIds = debts.map((d) => d.id);
    const payments = debtIds.length
      ? await this.debtPayments.find({
          where: { debtId: In(debtIds), shopId },
          order: { paidAt: 'DESC', createdAt: 'DESC' },
        })
      : [];
    const paymentsByDebt = new Map<string, DebtPayment[]>();
    for (const p of payments) {
      const list = paymentsByDebt.get(p.debtId) ?? [];
      list.push(p);
      paymentsByDebt.set(p.debtId, list);
    }

    const phoneIds = items
      .filter((i) => i.phoneId)
      .map((i) => i.phoneId as string);
    const accessoryIds = items
      .filter((i) => i.accessoryId)
      .map((i) => i.accessoryId as string);

    const phones = phoneIds.length
      ? await this.dataSource.getRepository(Phone).find({
          where: { id: In(phoneIds), shopId },
          withDeleted: true,
        })
      : [];
    const accessories = accessoryIds.length
      ? await this.dataSource.getRepository(Accessory).find({
          where: { id: In(accessoryIds), shopId },
          withDeleted: true,
        })
      : [];

    const phoneMap = new Map(phones.map((p) => [p.id, p]));
    const accMap = new Map(accessories.map((a) => [a.id, a]));
    const debtMap = new Map(debts.map((d) => [d.saleId, d]));
    const itemsBySale = new Map<string, SaleItem[]>();
    for (const item of items) {
      const list = itemsBySale.get(item.saleId) ?? [];
      list.push(item);
      itemsBySale.set(item.saleId, list);
    }

    const today = todayLocalDateString();
    const saleMap = new Map(sales.map((s) => [s.id, s]));

    return ids
      .map((id) => saleMap.get(id))
      .filter((s): s is Sale => Boolean(s))
      .map((sale) =>
        this.toResponse(
          sale,
          itemsBySale.get(sale.id) ?? [],
          phoneMap,
          accMap,
          debtMap.get(sale.id) ?? null,
          paymentsByDebt,
          refundByItem,
          today,
        ),
      );
  }

  private toResponse(
    sale: Sale,
    items: SaleItem[],
    phoneMap: Map<string, Phone>,
    accMap: Map<string, Accessory>,
    debt: Debt | null,
    paymentsByDebt: Map<string, DebtPayment[]>,
    refundByItem: Map<string, number>,
    today: string,
  ): SaleResponseDto {
    let profit = 0;
    const itemDtos = items.map((item) => {
      const net = item.quantity - item.returnedQuantity;
      // Profit on units still sold, plus any amount retained on returned units
      // (what the customer paid for them minus what was refunded).
      const retainedOnReturns =
        item.unitPrice * item.returnedQuantity -
        (refundByItem.get(item.id) ?? 0);
      profit += (item.unitPrice - item.costPrice) * net + retainedOnReturns;

      let snapshot;
      if (item.itemType === SaleItemType.PHONE && item.phoneId) {
        const p = phoneMap.get(item.phoneId);
        snapshot = {
          id: item.phoneId,
          name: p?.name ?? '',
          imei: p?.imei ?? null,
          memory: p ? this.formatMemory(p.ramGb, p.storageGb) : null,
          imageUrl: p?.imageUrl ?? null,
        };
      } else {
        const a = item.accessoryId ? accMap.get(item.accessoryId) : undefined;
        snapshot = {
          id: item.accessoryId ?? '',
          name: a?.name ?? '',
          imei: null,
          memory: null,
          imageUrl: a?.imageUrl ?? null,
        };
      }

      return {
        id: item.id,
        itemType: item.itemType,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        costPrice: item.costPrice,
        lineTotal: item.lineTotal,
        returnedQuantity: item.returnedQuantity,
        product: snapshot,
      };
    });

    return {
      id: sale.id,
      code: sale.code,
      type: sale.type,
      totalAmount: sale.totalAmount,
      paidAmount: sale.paidAmount,
      debtAmount: sale.debtAmount,
      status: sale.status,
      note: sale.note,
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      soldAt: sale.soldAt,
      profit: this.round2(profit),
      items: itemDtos,
      debt: debt
        ? buildDebtSummary({
            debtId: debt.id,
            saleId: sale.id,
            customerName: debt.customerName,
            customerPhone: debt.customerPhone,
            originalAmount: sale.debtAmount,
            remaining: debt.amount,
            dueDate: debt.dueDate,
            status: debt.status,
            today,
            payments: paymentsByDebt.get(debt.id) ?? [],
          })
        : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private validateDebt(
    debt: DebtInputDto,
    saleTotal: number,
  ): DebtInputDto & { customerPhone: string } {
    if (debt.amount <= 0) {
      throw BusinessException.badRequest(
        ErrorCode.DEBT_EXCEEDS_TOTAL,
        'Debt amount must be greater than zero',
      );
    }
    if (debt.amount > saleTotal) {
      throw BusinessException.badRequest(
        ErrorCode.DEBT_EXCEEDS_TOTAL,
        'Debt amount cannot exceed the sale total',
      );
    }
    if (!debt.customerName?.trim() || !debt.customerPhone?.trim()) {
      throw BusinessException.badRequest(
        ErrorCode.CUSTOMER_REQUIRED_FOR_DEBT,
        'Customer name and phone are required for a debt',
      );
    }
    const normalizedPhone = normalizeUzPhone(debt.customerPhone);
    if (!normalizedPhone) {
      throw BusinessException.badRequest(
        ErrorCode.CUSTOMER_REQUIRED_FOR_DEBT,
        'Customer phone is not a valid number',
      );
    }
    const today = todayLocalDateString();
    if (debt.dueDate < today) {
      throw BusinessException.badRequest(
        ErrorCode.DUE_DATE_IN_PAST,
        'Due date cannot be in the past',
      );
    }
    return { ...debt, customerPhone: normalizedPhone };
  }

  private async createDebt(
    manager: EntityManager,
    shopId: string,
    saleId: string,
    debt: DebtInputDto & { customerPhone: string },
  ): Promise<void> {
    await manager.getRepository(Debt).save({
      shopId,
      saleId,
      customerName: debt.customerName.trim(),
      customerPhone: debt.customerPhone,
      amount: debt.amount,
      dueDate: debt.dueDate,
      status: DebtStatus.OPEN,
    });
  }

  private async nextSaleCode(
    manager: EntityManager,
    shopId: string,
  ): Promise<string> {
    const repo = manager.getRepository(SaleCounter);
    let counter = await repo
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.shop_id = :shopId', { shopId })
      .getOne();

    if (!counter) {
      await repo.insert({ shopId, lastValue: '0' });
      counter = await repo
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.shop_id = :shopId', { shopId })
        .getOne();
    }

    const next = parseInt(counter!.lastValue, 10) + 1;
    counter!.lastValue = String(next);
    await repo.save(counter!);
    return `S-${String(next).padStart(6, '0')}`;
  }

  private formatMemory(
    ramGb: number | null,
    storageGb: number | null,
  ): string | null {
    if (ramGb === null && storageGb === null) return null;
    return [
      ramGb !== null ? `${ramGb} GB` : null,
      storageGb !== null ? `${storageGb} GB` : null,
    ]
      .filter(Boolean)
      .join(' / ');
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
