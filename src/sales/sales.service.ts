import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm';
import {
  BusinessException,
  ErrorCode,
  PaginatedResult,
  normalizeUzPhone,
  paginate,
  skipOf,
  localDateStartUtc,
  localDateEndExclusiveUtc,
  todayLocalDateString,
} from '../common';
import { AccessoriesService } from '../accessories/accessories.service';
import {
  Accessory,
  AccessoryKind,
} from '../accessories/entities/accessory.entity';
import { Debt, DebtStatus } from '../debts/entities/debt.entity';
import { Phone, PhoneStatus } from '../phones/entities/phone.entity';
import { DebtPayment } from '../debts/entities/debt-payment.entity';
import { CreateReturnDto } from './dto/create-return.dto';
import { CreateSaleDto, SaleLineDto } from './dto/create-sale.dto';
import { DebtInputDto } from './dto/debt-input.dto';
import { buildDebtSummary, SaleResponseDto } from './dto/sale-response.dto';
import { QuerySalesDto } from './dto/query-sales.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
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
    private readonly accessories: AccessoriesService,
  ) {}

  // ---------------------------------------------------------------------------
  // Selling
  // ---------------------------------------------------------------------------

  /**
   * Create one sale bundling any mix of phones and accessories. Each accessory
   * line names the exact stock batch (`stockEntryId`) the seller chose to sell
   * from — its cost is that batch's purchase price. Runs in a single
   * transaction with pessimistic locks on every phone / accessory / batch.
   */
  async createSale(
    shopId: string,
    userId: string,
    dto: CreateSaleDto,
  ): Promise<SaleResponseDto> {
    // Retry-safe checkout. On a flaky network the frontend's request can be
    // retried (or the button double-clicked) while the response is lost. With
    // a client-supplied `idempotencyKey` (one per checkout intent) a repeat
    // submit returns the first sale instead of selling the stock again. The
    // fast path handles a sequential retry; the partial unique index + the
    // catch below cover a truly concurrent race.
    if (dto.idempotencyKey) {
      const existing = await this.sales.findOne({
        where: { shopId, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return this.findOne(shopId, existing.id);
    }

    let saleId: string;
    try {
      saleId = await this.dataSource.transaction(async (manager) => {
        const phoneIdsSeen = new Set<string>();
        const stockEntryIdsSeen = new Set<string>();
        // Distinct product categories in this sale, to derive the header type.
        const categories = new Set<SaleType>();
        let totalAmount = 0;

        // Build every line first (locking + consuming stock), then the header.
        const pendingItems: Array<Partial<SaleItem>> = [];

        for (const line of dto.items) {
          if (line.type === SaleItemType.PHONE) {
            categories.add(SaleType.PHONE);
            const built = await this.buildPhoneLine(
              manager,
              shopId,
              line,
              phoneIdsSeen,
            );
            pendingItems.push(built.item);
            totalAmount += built.lineTotal;
          } else {
            // ACCESSORY and KEYPAD_PHONE both draw from the accessory batch engine.
            categories.add(
              line.type === SaleItemType.KEYPAD_PHONE
                ? SaleType.KEYPAD_PHONE
                : SaleType.ACCESSORY,
            );
            const built = await this.buildAccessoryLine(
              manager,
              shopId,
              line,
              stockEntryIdsSeen,
            );
            pendingItems.push(built.item);
            totalAmount += built.lineTotal;
          }
        }

        totalAmount = this.round2(totalAmount);
        // One category → that type; more than one → MIXED.
        const type =
          categories.size > 1
            ? SaleType.MIXED
            : (categories.values().next().value as SaleType);

        const debt = dto.debt ? this.validateDebt(dto.debt, totalAmount) : null;
        const paidAmount = debt ? totalAmount - debt.amount : totalAmount;

        const sale = await manager.getRepository(Sale).save({
          shopId,
          code: await this.nextSaleCode(manager, shopId),
          type,
          totalAmount,
          paidAmount,
          debtAmount: debt ? debt.amount : 0,
          status: SaleStatus.COMPLETED,
          note: dto.note ?? null,
          customerName:
            dto.customerName?.trim() || debt?.customerName?.trim() || null,
          customerPhone:
            dto.customerPhone?.trim() || debt?.customerPhone || null,
          soldBy: userId,
          idempotencyKey: dto.idempotencyKey ?? null,
        });

        await manager.getRepository(SaleItem).save(
          pendingItems.map((item) => ({
            ...item,
            shopId,
            saleId: sale.id,
            returnedQuantity: 0,
          })),
        );

        if (debt) {
          await this.createDebt(manager, shopId, sale.id, debt);
        }

        return sale.id;
      });
    } catch (err) {
      // A concurrent submit with the same key won the insert race: the unique
      // index (uq_sales_shop_idempotency) rejected ours and rolled the whole
      // transaction back (stock un-consumed) — return the winning sale.
      if (dto.idempotencyKey && this.isUniqueViolation(err)) {
        const existing = await this.sales.findOne({
          where: { shopId, idempotencyKey: dto.idempotencyKey },
        });
        if (existing) return this.findOne(shopId, existing.id);
      }
      throw err;
    }

    return this.findOne(shopId, saleId);
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err.driverError as { code?: string })?.code === '23505'
    );
  }

  /** Lock a phone, flip it to SOLD, and shape its sale-item line. */
  private async buildPhoneLine(
    manager: EntityManager,
    shopId: string,
    line: SaleLineDto,
    phoneIdsSeen: Set<string>,
  ): Promise<{ item: Partial<SaleItem>; lineTotal: number }> {
    if (!line.phoneId) {
      throw BusinessException.badRequest(
        ErrorCode.SALE_LINE_INVALID,
        'phoneId is required for a phone line',
      );
    }
    if (phoneIdsSeen.has(line.phoneId)) {
      throw BusinessException.badRequest(
        ErrorCode.SALE_LINE_INVALID,
        'The same phone cannot appear twice in one sale',
      );
    }
    phoneIdsSeen.add(line.phoneId);

    const phone = await manager
      .getRepository(Phone)
      .createQueryBuilder('phone')
      .setLock('pessimistic_write')
      .where('phone.id = :id AND phone.shop_id = :shopId', {
        id: line.phoneId,
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

    phone.status = PhoneStatus.SOLD;
    await manager.getRepository(Phone).save(phone);

    const lineTotal = this.round2(line.unitPrice);
    return {
      lineTotal,
      item: {
        itemType: SaleItemType.PHONE,
        phoneId: phone.id,
        accessoryId: null,
        quantity: 1,
        unitPrice: line.unitPrice,
        costPrice: phone.purchasePrice,
        lineTotal,
      },
    };
  }

  /**
   * Lock an accessory + its chosen batch, consume from that batch (exact
   * batch cost), recalc the accessory, and shape the sale-item line.
   */
  private async buildAccessoryLine(
    manager: EntityManager,
    shopId: string,
    line: SaleLineDto,
    stockEntryIdsSeen: Set<string>,
  ): Promise<{ item: Partial<SaleItem>; lineTotal: number }> {
    if (!line.accessoryId || !line.stockEntryId || !line.quantity) {
      throw BusinessException.badRequest(
        ErrorCode.SALE_LINE_INVALID,
        'accessoryId, stockEntryId and quantity are required for an accessory line',
      );
    }
    if (stockEntryIdsSeen.has(line.stockEntryId)) {
      throw BusinessException.badRequest(
        ErrorCode.SALE_LINE_INVALID,
        'The same stock batch cannot appear twice in one sale — combine the quantities',
      );
    }
    stockEntryIdsSeen.add(line.stockEntryId);

    const accessory = await this.accessories.lockAccessory(
      manager,
      shopId,
      line.accessoryId,
    );

    // The line type must match what the item actually is — you can't sell a
    // keypad phone on an ACCESSORY line or vice versa.
    const expectedType =
      accessory.kind === AccessoryKind.KEYPAD_PHONE
        ? SaleItemType.KEYPAD_PHONE
        : SaleItemType.ACCESSORY;
    if (line.type !== expectedType) {
      throw BusinessException.badRequest(
        ErrorCode.SALE_LINE_INVALID,
        `Line type ${line.type} does not match item kind ${accessory.kind}`,
      );
    }

    const { cost } = await this.accessories.consumeLayer(
      manager,
      accessory,
      line.stockEntryId,
      line.quantity,
    );
    await this.accessories.recalcAccessory(manager, accessory);

    const lineTotal = this.round2(line.unitPrice * line.quantity);
    return {
      lineTotal,
      item: {
        itemType: expectedType,
        phoneId: null,
        accessoryId: accessory.id,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        costPrice: cost,
        lineTotal,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Editing (price correction)
  // ---------------------------------------------------------------------------

  /**
   * Correct the recorded price(s) of an existing sale and restate its debt.
   * Works in every state — including sales that already have returns or debt
   * repayments — by treating money that has actually moved as fixed facts and
   * only re-deriving what remains:
   *
   * - Reprices the listed lines (cost prices are never touched) and recomputes
   *   `totalAmount = Σ unitPrice × quantity`.
   * - `dto.debt.amount` means the balance the customer STILL owes (outstanding).
   *   Already-collected installments (`debt_payments`) and refunds already paid
   *   on returns (`sale_returns`) are preserved untouched.
   * - Re-derives the header so `paidAmount + debtAmount = totalAmount`, where
   *   `debtAmount` (original debt) = outstanding + already-repaid, and
   *   `paidAmount` (down payment) absorbs the rest.
   *
   * Statistics need no separate update — sold amount / profit are computed from
   * `unitPrice × net`, and cash/debt from these header columns, on every read.
   *
   * The only hard limit: the new total cannot fall below the cash already
   * collected on the sale (down payment + installments); refunding that
   * difference is a separate action (→ SALE_TOTAL_BELOW_COLLECTED).
   */
  async updateSale(
    shopId: string,
    saleId: string,
    dto: UpdateSaleDto,
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

      const items = await manager.getRepository(SaleItem).find({
        where: { saleId: sale.id, shopId },
      });

      // Apply the new prices to the referenced lines (any item type). Returns
      // and their refunds stay as-is — profit re-derives from the new price.
      const itemById = new Map(items.map((i) => [i.id, i]));
      for (const patch of dto.items) {
        const item = itemById.get(patch.id);
        if (!item) {
          throw BusinessException.badRequest(
            ErrorCode.SALE_LINE_INVALID,
            'Sale item does not belong to this sale',
            { saleItemId: patch.id },
          );
        }
        item.unitPrice = patch.unitPrice;
        item.lineTotal = this.round2(patch.unitPrice * item.quantity);
      }

      const totalAmount = this.round2(
        items.reduce((sum, i) => sum + i.lineTotal, 0),
      );

      // Existing debt + the sum of installments already collected against it.
      const existingDebt = await manager.getRepository(Debt).findOne({
        where: { saleId: sale.id, shopId },
      });
      const repaid = existingDebt
        ? await this.sumDebtPayments(manager, shopId, existingDebt.id)
        : 0;

      let debtAmount: number;
      if (dto.debt) {
        // `dto.debt.amount` is the outstanding balance still owed. The most that
        // can still be financed is what's left after already-collected cash.
        const debt = this.validateDebt(
          dto.debt,
          totalAmount,
          this.round2(totalAmount - repaid),
        );
        const outstanding = debt.amount;
        debtAmount = this.round2(outstanding + repaid);

        if (existingDebt) {
          existingDebt.customerName = debt.customerName.trim();
          existingDebt.customerPhone = debt.customerPhone;
          existingDebt.amount = outstanding;
          existingDebt.dueDate = debt.dueDate;
          existingDebt.status = DebtStatus.OPEN;
          existingDebt.paidAt = null;
          await manager.getRepository(Debt).save(existingDebt);
        } else {
          await this.createDebt(manager, shopId, sale.id, debt);
        }
        // Mirror the buyer contact onto the sale when it has none yet.
        sale.customerName = sale.customerName || debt.customerName.trim();
        sale.customerPhone = sale.customerPhone || debt.customerPhone;
      } else if (repaid > 0) {
        // No outstanding balance requested, but installments were collected —
        // the debt is now fully settled. Keep the payment history; the new
        // total cannot drop below what was already collected.
        if (totalAmount < repaid) {
          throw BusinessException.conflict(
            ErrorCode.SALE_TOTAL_BELOW_COLLECTED,
            'New total is below the amount already collected on this sale; refund the difference first',
            { collected: repaid, newTotal: totalAmount },
          );
        }
        debtAmount = repaid;
        existingDebt!.amount = 0;
        existingDebt!.status = DebtStatus.PAID;
        existingDebt!.paidAt = existingDebt!.paidAt ?? new Date();
        await manager.getRepository(Debt).save(existingDebt!);
      } else {
        // Fully cash — no outstanding balance, no collected installments.
        debtAmount = 0;
        if (existingDebt) {
          await manager.getRepository(Debt).delete({ id: existingDebt.id });
        }
      }

      sale.totalAmount = totalAmount;
      sale.debtAmount = debtAmount;
      sale.paidAmount = this.round2(totalAmount - debtAmount);

      // Recompute status from the (unchanged) returned quantities.
      const fullyReturned = items.every(
        (i) => i.returnedQuantity >= i.quantity,
      );
      const anyReturned = items.some((i) => i.returnedQuantity > 0);
      sale.status = fullyReturned
        ? SaleStatus.RETURNED
        : anyReturned
          ? SaleStatus.PARTIALLY_RETURNED
          : SaleStatus.COMPLETED;

      await manager.getRepository(SaleItem).save(items);
      await manager.getRepository(Sale).save(sale);
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

      const saleReturn = await manager.getRepository(SaleReturn).save({
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
      } else if (item.accessoryId) {
        // ACCESSORY or KEYPAD_PHONE — returned units re-enter as their own FIFO
        // layer, valued at the cost they were sold at (the sale item snapshot).
        const accessory = await this.accessories.lockAccessory(
          manager,
          shopId,
          item.accessoryId,
        );
        await this.accessories.addReturnLayer(
          manager,
          accessory,
          dto.quantity,
          item.costPrice,
          saleReturn.id,
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
      .offset(skipOf(query))
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
    maxAmount: number = saleTotal,
  ): DebtInputDto & { customerPhone: string } {
    if (debt.amount <= 0) {
      throw BusinessException.badRequest(
        ErrorCode.DEBT_EXCEEDS_TOTAL,
        'Debt amount must be greater than zero',
      );
    }
    if (debt.amount > maxAmount) {
      throw BusinessException.badRequest(
        ErrorCode.DEBT_EXCEEDS_TOTAL,
        'Debt amount cannot exceed the amount still financeable on this sale',
        { maxAmount: this.round2(maxAmount) },
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

  /** Sum of installments collected against a debt (0 if none). */
  private async sumDebtPayments(
    manager: EntityManager,
    shopId: string,
    debtId: string,
  ): Promise<number> {
    const row = await manager
      .getRepository(DebtPayment)
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'sum')
      .where('p.debt_id = :debtId AND p.shop_id = :shopId', { debtId, shopId })
      .getRawOne<{ sum: string }>();
    return this.round2(Number(row?.sum ?? 0));
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
