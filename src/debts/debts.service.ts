import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import {
  BusinessException,
  ErrorCode,
  PaginatedResult,
  paginate,
  todayLocalDateString,
  localDateStartUtc,
  localDateEndExclusiveUtc,
} from '../common';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem, SaleItemType } from '../sales/entities/sale-item.entity';
import { Phone } from '../phones/entities/phone.entity';
import { Accessory } from '../accessories/entities/accessory.entity';
import { DebtResponseDto } from './dto/debt-response.dto';
import { QueryDebtsDto } from './dto/query-debts.dto';
import { PayDebtDto, UpdateDebtDto } from './dto/update-debt.dto';
import { Debt, DebtStatus } from './entities/debt.entity';

@Injectable()
export class DebtsService {
  constructor(
    @InjectRepository(Debt) private readonly debts: Repository<Debt>,
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItems: Repository<SaleItem>,
    @InjectRepository(Phone) private readonly phones: Repository<Phone>,
    @InjectRepository(Accessory)
    private readonly accessories: Repository<Accessory>,
  ) {}

  async findAll(
    shopId: string,
    query: QueryDebtsDto,
  ): Promise<PaginatedResult<DebtResponseDto>> {
    const today = todayLocalDateString();
    const qb = this.debts
      .createQueryBuilder('debt')
      .where('debt.shop_id = :shopId', { shopId });

    if (query.status) {
      qb.andWhere('debt.status = :status', { status: query.status });
    }
    if (query.overdue) {
      qb.andWhere('debt.status = :openStatus', {
        openStatus: DebtStatus.OPEN,
      }).andWhere('debt.due_date < :today', { today });
    }
    if (query.search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('debt.customer_name ILIKE :search', {
            search: `%${query.search}%`,
          }).orWhere('debt.customer_phone ILIKE :search', {
            search: `%${query.search}%`,
          });
        }),
      );
    }
    if (query.from) {
      qb.andWhere('debt.created_at >= :from', {
        from: localDateStartUtc(query.from),
      });
    }
    if (query.to) {
      qb.andWhere('debt.created_at < :toExclusive', {
        toExclusive: localDateEndExclusiveUtc(query.to),
      });
    }

    qb.orderBy('debt.due_date', 'ASC').skip(query.skip).take(query.limit);

    const [debts, total] = await qb.getManyAndCount();
    const data = await this.hydrate(shopId, debts, today);
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(shopId: string, id: string): Promise<DebtResponseDto> {
    const debt = await this.debts.findOne({ where: { id, shopId } });
    if (!debt) {
      throw BusinessException.notFound('Debt not found');
    }
    const [dto] = await this.hydrate(shopId, [debt], todayLocalDateString());
    return dto;
  }

  async pay(
    shopId: string,
    id: string,
    dto: PayDebtDto,
  ): Promise<DebtResponseDto> {
    const debt = await this.debts.findOne({ where: { id, shopId } });
    if (!debt) {
      throw BusinessException.notFound('Debt not found');
    }
    if (debt.status !== DebtStatus.OPEN) {
      throw BusinessException.conflict(
        ErrorCode.DEBT_NOT_OPEN,
        'Only an open debt can be marked paid',
      );
    }
    // Store the settlement instant; default to now.
    debt.status = DebtStatus.PAID;
    debt.paidAt = dto.paidAt
      ? new Date(dto.paidAt + 'T00:00:00Z')
      : new Date();
    await this.debts.save(debt);
    return this.findOne(shopId, id);
  }

  async update(
    shopId: string,
    id: string,
    dto: UpdateDebtDto,
  ): Promise<DebtResponseDto> {
    const debt = await this.debts.findOne({ where: { id, shopId } });
    if (!debt) {
      throw BusinessException.notFound('Debt not found');
    }
    if (dto.dueDate !== undefined) debt.dueDate = dto.dueDate;
    if (dto.note !== undefined) debt.note = dto.note;
    await this.debts.save(debt);
    return this.findOne(shopId, id);
  }

  /** Attach sale total/paid + product names + overdue computation. */
  private async hydrate(
    shopId: string,
    debts: Debt[],
    today: string,
  ): Promise<DebtResponseDto[]> {
    if (debts.length === 0) return [];

    const saleIds = debts.map((d) => d.saleId);
    const sales = await this.sales.find({
      where: { id: In(saleIds), shopId },
    });
    const items = await this.saleItems.find({
      where: { saleId: In(saleIds), shopId },
    });

    const phoneIds = items
      .filter((i) => i.phoneId)
      .map((i) => i.phoneId as string);
    const accessoryIds = items
      .filter((i) => i.accessoryId)
      .map((i) => i.accessoryId as string);
    const phones = phoneIds.length
      ? await this.phones.find({
          where: { id: In(phoneIds), shopId },
          withDeleted: true,
        })
      : [];
    const accessories = accessoryIds.length
      ? await this.accessories.find({
          where: { id: In(accessoryIds), shopId },
          withDeleted: true,
        })
      : [];

    const phoneMap = new Map(phones.map((p) => [p.id, p.name]));
    const accMap = new Map(accessories.map((a) => [a.id, a.name]));
    const saleMap = new Map(sales.map((s) => [s.id, s]));
    const namesBySale = new Map<string, string[]>();
    for (const item of items) {
      const name =
        item.itemType === SaleItemType.PHONE && item.phoneId
          ? phoneMap.get(item.phoneId)
          : item.accessoryId
            ? accMap.get(item.accessoryId)
            : undefined;
      if (!name) continue;
      const list = namesBySale.get(item.saleId) ?? [];
      list.push(name);
      namesBySale.set(item.saleId, list);
    }

    return debts.map((debt) => {
      const sale = saleMap.get(debt.saleId);
      const isOverdue =
        debt.status === DebtStatus.OPEN && debt.dueDate < today;
      return {
        id: debt.id,
        saleId: debt.saleId,
        saleCode: sale?.code ?? '',
        customerName: debt.customerName,
        customerPhone: debt.customerPhone,
        productName: (namesBySale.get(debt.saleId) ?? []).join(', '),
        saleTotalAmount: sale?.totalAmount ?? 0,
        paidAmount: sale?.paidAmount ?? 0,
        amount: debt.amount,
        dueDate: debt.dueDate,
        status: debt.status,
        paidAt: debt.paidAt,
        note: debt.note,
        isOverdue,
        daysOverdue: isOverdue ? this.daysBetween(debt.dueDate, today) : 0,
        createdAt: debt.createdAt,
      };
    });
  }

  private daysBetween(fromDate: string, toDate: string): number {
    const from = Date.parse(fromDate + 'T00:00:00Z');
    const to = Date.parse(toDate + 'T00:00:00Z');
    return Math.max(0, Math.round((to - from) / 86400000));
  }
}
