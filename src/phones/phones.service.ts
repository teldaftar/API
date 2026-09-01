import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm';
import {
  BusinessException,
  ErrorCode,
  PaginatedResult,
  paginate,
  localDateStartUtc,
  localDateEndExclusiveUtc,
} from '../common';
import { Shop } from '../shop/entities/shop.entity';
import { SaleItem, SaleItemType } from '../sales/entities/sale-item.entity';
import { Sale } from '../sales/entities/sale.entity';
import { Debt } from '../debts/entities/debt.entity';
import { DebtPayment } from '../debts/entities/debt-payment.entity';
import {
  buildDebtSummary,
  SaleDebtSummaryDto,
} from '../sales/dto/sale-response.dto';
import { todayLocalDateString, skipOf } from '../common';
import { UploadsService } from '../uploads/uploads.service';
import { CreatePhoneDto } from './dto/create-phone.dto';
import { PhoneLabelDto, PhoneResponseDto } from './dto/phone-response.dto';
import { QueryPhonesDto } from './dto/query-phones.dto';
import { UpdatePhoneDto } from './dto/update-phone.dto';
import {
  Phone,
  PhoneCondition,
  PhoneStatus,
  PhoneUsedGrade,
} from './entities/phone.entity';

@Injectable()
export class PhonesService {
  constructor(
    @InjectRepository(Phone)
    private readonly phones: Repository<Phone>,
    @InjectRepository(Shop)
    private readonly shops: Repository<Shop>,
    @InjectRepository(SaleItem)
    private readonly saleItems: Repository<SaleItem>,
    @InjectRepository(Sale)
    private readonly sales: Repository<Sale>,
    @InjectRepository(Debt)
    private readonly debts: Repository<Debt>,
    @InjectRepository(DebtPayment)
    private readonly debtPayments: Repository<DebtPayment>,
    private readonly uploads: UploadsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Latest sale (price + sale id) per phone — the phone's most recent sale.
   * A phone can be sold, returned, and resold, so the current SOLD state maps
   * to the newest sale item (max sold_at). Batched to avoid N+1.
   */
  private async latestSaleMap(
    shopId: string,
    phoneIds: string[],
  ): Promise<Map<string, { unitPrice: number; saleId: string }>> {
    if (phoneIds.length === 0) return new Map();
    const rows = await this.saleItems
      .createQueryBuilder('si')
      .select('si.phone_id', 'phone_id')
      .addSelect('si.unit_price', 'unit_price')
      .addSelect('si.sale_id', 'sale_id')
      .innerJoin('sales', 's', 's.id = si.sale_id')
      .where('si.shop_id = :shopId', { shopId })
      .andWhere('si.item_type = :type', { type: SaleItemType.PHONE })
      .andWhere('si.phone_id IN (:...phoneIds)', { phoneIds })
      .distinctOn(['si.phone_id'])
      .orderBy('si.phone_id')
      .addOrderBy('s.sold_at', 'DESC')
      .getRawMany<{ phone_id: string; unit_price: string; sale_id: string }>();
    return new Map(
      rows.map((r) => [
        r.phone_id,
        { unitPrice: parseFloat(r.unit_price), saleId: r.sale_id },
      ]),
    );
  }

  /**
   * Debt summary (with payment history) keyed by phone id, for phones whose
   * latest sale was on debt. Batched: one debts query + one payments query.
   */
  private async debtByPhone(
    shopId: string,
    latestSales: Map<string, { unitPrice: number; saleId: string }>,
  ): Promise<Map<string, SaleDebtSummaryDto>> {
    const result = new Map<string, SaleDebtSummaryDto>();
    if (latestSales.size === 0) return result;

    const saleIds = [...latestSales.values()].map((v) => v.saleId);
    const sales = await this.sales.find({
      where: { id: In(saleIds), shopId },
    });
    const debts = await this.debts.find({
      where: { saleId: In(saleIds), shopId },
    });
    if (debts.length === 0) return result;

    const saleMap = new Map(sales.map((s) => [s.id, s]));
    const debtBySale = new Map(debts.map((d) => [d.saleId, d]));

    const debtIds = debts.map((d) => d.id);
    const payments = await this.debtPayments.find({
      where: { debtId: In(debtIds), shopId },
      order: { paidAt: 'DESC', createdAt: 'DESC' },
    });
    const paymentsByDebt = new Map<string, DebtPayment[]>();
    for (const p of payments) {
      const list = paymentsByDebt.get(p.debtId) ?? [];
      list.push(p);
      paymentsByDebt.set(p.debtId, list);
    }

    const today = todayLocalDateString();
    for (const [phoneId, { saleId }] of latestSales) {
      const debt = debtBySale.get(saleId);
      if (!debt) continue;
      const sale = saleMap.get(saleId);
      result.set(
        phoneId,
        buildDebtSummary({
          debtId: debt.id,
          saleId,
          customerName: debt.customerName,
          customerPhone: debt.customerPhone,
          originalAmount: sale?.debtAmount ?? debt.amount,
          remaining: debt.amount,
          dueDate: debt.dueDate,
          status: debt.status,
          today,
          payments: paymentsByDebt.get(debt.id) ?? [],
        }),
      );
    }
    return result;
  }

  /** Map a phone to its response DTO, attaching salePrice + debt when SOLD. */
  async present(shopId: string, phone: Phone): Promise<PhoneResponseDto> {
    const [dto] = await this.presentMany(shopId, [phone]);
    return dto;
  }

  /** Batch version of {@link present}. */
  async presentMany(
    shopId: string,
    phones: Phone[],
  ): Promise<PhoneResponseDto[]> {
    const soldIds = phones
      .filter((p) => p.status === PhoneStatus.SOLD)
      .map((p) => p.id);
    const latestSales = await this.latestSaleMap(shopId, soldIds);
    const debtByPhone = await this.debtByPhone(shopId, latestSales);
    return phones.map((p) =>
      PhoneResponseDto.from(
        p,
        latestSales.get(p.id)?.unitPrice ?? null,
        debtByPhone.get(p.id) ?? null,
      ),
    );
  }

  async create(shopId: string, dto: CreatePhoneDto): Promise<Phone> {
    // Retry-safe intake. The reported bug: on a flaky network the frontend's
    // request was retried (or double-submitted) while the response was lost,
    // and each attempt inserted a fresh row — so one phone entered stock twice.
    // A client-supplied `idempotencyKey` (one per "add phone" intent) fixes
    // this: a repeat submit with the same key returns the first phone instead
    // of creating a second. The fast path catches a sequential retry; the
    // partial unique index + the catch below cover a truly concurrent race.
    if (dto.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(
        shopId,
        dto.idempotencyKey,
      );
      if (existing) return existing;
    }

    if (dto.imei) {
      await this.assertImeiFree(shopId, dto.imei);
    }

    const condition = dto.condition ?? null;
    const usedGrade = this.resolveUsedGrade(condition, dto.usedGrade);

    const phone = this.phones.create({
      shopId,
      name: dto.name.trim(),
      imei: dto.imei ?? null,
      supplierName: dto.supplierName?.trim() ?? null,
      supplierSurname: dto.supplierSurname?.trim() ?? null,
      supplierPhone: dto.supplierPhone?.trim() ?? null,
      purchasePrice: dto.purchasePrice,
      listPrice: dto.listPrice ?? null,
      condition,
      usedGrade,
      hasBox: dto.hasBox ?? null,
      hasCharger: dto.hasCharger ?? null,
      ramGb: dto.ramGb ?? null,
      storageGb: dto.storageGb ?? null,
      imageUrl: dto.imageUrl ?? null,
      note: dto.note ?? null,
      status: PhoneStatus.IN_STOCK,
      idempotencyKey: dto.idempotencyKey ?? null,
    });

    try {
      return await this.phones.save(phone);
    } catch (err) {
      // A concurrent submit with the same key won the insert race: the unique
      // index (uq_phones_shop_idempotency) rejects ours — return the winner.
      if (dto.idempotencyKey && this.isUniqueViolation(err)) {
        const existing = await this.findByIdempotencyKey(
          shopId,
          dto.idempotencyKey,
        );
        if (existing) return existing;
        // Not a key clash — must be a concurrent IMEI collision. Surface the
        // friendly conflict instead of leaking a raw DB error.
        if (dto.imei) {
          await this.assertImeiFree(shopId, dto.imei);
        }
      }
      throw err;
    }
  }

  private findByIdempotencyKey(
    shopId: string,
    idempotencyKey: string,
  ): Promise<Phone | null> {
    return this.phones.findOne({ where: { shopId, idempotencyKey } });
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err.driverError as { code?: string })?.code === '23505'
    );
  }

  async findAll(
    shopId: string,
    query: QueryPhonesDto,
  ): Promise<PaginatedResult<Phone>> {
    const qb = this.phones
      .createQueryBuilder('phone')
      .where('phone.shop_id = :shopId', { shopId })
      .andWhere('phone.deleted_at IS NULL');

    if (query.status) {
      qb.andWhere('phone.status = :status', { status: query.status });
    }
    if (query.condition) {
      qb.andWhere('phone.condition = :condition', {
        condition: query.condition,
      });
    }
    if (query.search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('phone.name ILIKE :search', {
            search: `%${query.search}%`,
          }).orWhere('phone.imei ILIKE :search', {
            search: `%${query.search}%`,
          });
        }),
      );
    }
    if (query.from) {
      qb.andWhere('phone.created_at >= :from', {
        from: localDateStartUtc(query.from),
      });
    }
    if (query.to) {
      qb.andWhere('phone.created_at < :toExclusive', {
        toExclusive: localDateEndExclusiveUtc(query.to),
      });
    }

    const sortColumn = {
      createdAt: 'phone.created_at',
      name: 'phone.name',
      purchasePrice: 'phone.purchase_price',
    }[query.sort ?? 'createdAt'];

    qb.orderBy(sortColumn, query.order ?? 'DESC')
      .skip(skipOf(query))
      .take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(shopId: string, id: string): Promise<Phone> {
    const phone = await this.phones.findOne({
      where: { id, shopId },
    });
    if (!phone) {
      throw BusinessException.notFound('Phone not found');
    }
    return phone;
  }

  async update(
    shopId: string,
    id: string,
    dto: UpdatePhoneDto,
  ): Promise<Phone> {
    const phone = await this.findOne(shopId, id);

    // A sold phone is fully editable — `status` is not part of the DTO, so a
    // sale can never be undone here. Correcting a sold phone's purchase price
    // propagates to its sale line(s) below so profit stats stay right.

    if (dto.imei && dto.imei !== phone.imei) {
      await this.assertImeiFree(shopId, dto.imei, id);
      phone.imei = dto.imei;
    }

    const previousImage = phone.imageUrl;
    const previousPurchasePrice = phone.purchasePrice;

    if (dto.name !== undefined) phone.name = dto.name.trim();
    if (dto.supplierName !== undefined)
      phone.supplierName = dto.supplierName?.trim() ?? null;
    if (dto.supplierSurname !== undefined)
      phone.supplierSurname = dto.supplierSurname?.trim() ?? null;
    if (dto.supplierPhone !== undefined)
      phone.supplierPhone = dto.supplierPhone?.trim() ?? null;
    if (dto.purchasePrice !== undefined)
      phone.purchasePrice = dto.purchasePrice;
    if (dto.listPrice !== undefined) phone.listPrice = dto.listPrice;
    if (dto.condition !== undefined) phone.condition = dto.condition;
    if (dto.usedGrade !== undefined) phone.usedGrade = dto.usedGrade;
    // Grade is only meaningful for USED phones: reject an explicit grade on a
    // non-used phone, and clear any leftover grade when moving away from USED.
    if (phone.condition !== PhoneCondition.USED) {
      if (dto.usedGrade) {
        throw BusinessException.badRequest(
          ErrorCode.VALIDATION_FAILED,
          'usedGrade is only allowed when condition is USED',
        );
      }
      phone.usedGrade = null;
    }
    if (dto.hasBox !== undefined) phone.hasBox = dto.hasBox;
    if (dto.hasCharger !== undefined) phone.hasCharger = dto.hasCharger;
    if (dto.ramGb !== undefined) phone.ramGb = dto.ramGb;
    if (dto.storageGb !== undefined) phone.storageGb = dto.storageGb;
    if (dto.imageUrl !== undefined) phone.imageUrl = dto.imageUrl;
    if (dto.note !== undefined) phone.note = dto.note;

    const purchasePriceChanged =
      dto.purchasePrice !== undefined &&
      phone.purchasePrice !== previousPurchasePrice;

    const saved = await this.dataSource.transaction(async (manager) => {
      const s = await manager.getRepository(Phone).save(phone);
      // The sale line snapshots the phone's purchase price as `cost_price` at
      // sale time, and profit/statistics read that snapshot — not the live
      // phone. So a corrected purchase price must flow to this phone's sale
      // line(s), otherwise the "purchased" total would update but profit would
      // stay wrong. A phone is one physical unit bought once, so every sale
      // line for it shares the same cost.
      if (purchasePriceChanged) {
        await manager
          .getRepository(SaleItem)
          .update({ phoneId: id, shopId }, { costPrice: s.purchasePrice });
      }
      return s;
    });

    // Image was replaced/cleared → drop the now-orphaned old file.
    if (previousImage && previousImage !== saved.imageUrl) {
      await this.uploads.removeByUrl(previousImage);
    }

    return saved;
  }

  async remove(shopId: string, id: string): Promise<void> {
    const phone = await this.findOne(shopId, id);
    if (phone.status !== PhoneStatus.IN_STOCK) {
      throw BusinessException.conflict(
        ErrorCode.PHONE_ALREADY_SOLD,
        'Only in-stock phones can be deleted',
      );
    }
    const image = phone.imageUrl;
    // Deletable phones are IN_STOCK, so no sale references them — safe to drop
    // the image and null the column before soft-removing the row.
    if (image) {
      phone.imageUrl = null;
      await this.phones.save(phone);
    }
    await this.phones.softRemove(phone);
    if (image) {
      await this.uploads.removeByUrl(image);
    }
  }

  async label(shopId: string, id: string): Promise<PhoneLabelDto> {
    const phone = await this.findOne(shopId, id);
    const shop = await this.shops.findOne({ where: { id: shopId } });

    const memory =
      phone.ramGb !== null || phone.storageGb !== null
        ? [
            phone.ramGb !== null ? `${phone.ramGb} GB` : null,
            phone.storageGb !== null ? `${phone.storageGb} GB` : null,
          ]
            .filter(Boolean)
            .join(' / ')
        : null;

    return {
      shopName: shop?.name ?? '',
      name: phone.name,
      memory,
      condition: phone.condition,
      imei: phone.imei,
      labelFooter: shop?.labelFooter ?? null,
    };
  }

  /**
   * A wear grade is only valid for a USED phone. Rejects a grade sent with any
   * other condition; returns null when the phone isn't USED.
   */
  private resolveUsedGrade(
    condition: PhoneCondition | null,
    usedGrade: PhoneUsedGrade | undefined,
  ): PhoneUsedGrade | null {
    if (condition !== PhoneCondition.USED) {
      if (usedGrade) {
        throw BusinessException.badRequest(
          ErrorCode.VALIDATION_FAILED,
          'usedGrade is only allowed when condition is USED',
        );
      }
      return null;
    }
    return usedGrade ?? null;
  }

  /**
   * Enforces the "one in-stock IMEI per shop" rule that the partial unique
   * index guarantees at the DB level, but with a friendly error + conflict id.
   */
  private async assertImeiFree(
    shopId: string,
    imei: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.phones
      .createQueryBuilder('phone')
      .where('phone.shop_id = :shopId', { shopId })
      .andWhere('phone.imei = :imei', { imei })
      .andWhere('phone.deleted_at IS NULL')
      .andWhere('phone.status = :status', { status: PhoneStatus.IN_STOCK });
    if (excludeId) {
      qb.andWhere('phone.id != :excludeId', { excludeId });
    }
    const conflict = await qb.getOne();
    if (conflict) {
      throw BusinessException.conflict(
        ErrorCode.IMEI_ALREADY_EXISTS,
        'A phone with this IMEI is already in stock',
        { phoneId: conflict.id },
      );
    }
  }
}
