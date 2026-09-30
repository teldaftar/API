import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BusinessException,
  PaginatedResult,
  localDateEndExclusiveUtc,
  localDateStartUtc,
  paginate,
  skipOf,
} from '../common';
import { CreateDebtBookEntryDto } from './dto/create-debt-book-entry.dto';
import { QueryDebtBookDto } from './dto/query-debt-book.dto';
import { UpdateDebtBookEntryDto } from './dto/update-debt-book-entry.dto';
import { DebtBookEntry } from './entities/debt-book-entry.entity';

@Injectable()
export class DebtBookService {
  constructor(
    @InjectRepository(DebtBookEntry)
    private readonly entries: Repository<DebtBookEntry>,
  ) {}

  async create(
    shopId: string,
    userId: string,
    dto: CreateDebtBookEntryDto,
  ): Promise<DebtBookEntry> {
    const entry = this.entries.create({
      shopId,
      borrowerName: dto.borrowerName.trim(),
      phone: dto.phone?.trim() || null,
      amount: dto.amount,
      dueDate: dto.dueDate || null,
      note: dto.note?.trim() || null,
      createdBy: userId,
    });
    return this.entries.save(entry);
  }

  async findAll(
    shopId: string,
    query: QueryDebtBookDto,
  ): Promise<PaginatedResult<DebtBookEntry>> {
    const qb = this.entries
      .createQueryBuilder('d')
      .where('d.shop_id = :shopId', { shopId })
      .andWhere('d.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere(
        '(d.borrower_name ILIKE :search OR d.phone ILIKE :search OR d.note ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.from) {
      qb.andWhere('d.created_at >= :from', {
        from: localDateStartUtc(query.from),
      });
    }
    if (query.to) {
      qb.andWhere('d.created_at < :to', {
        to: localDateEndExclusiveUtc(query.to),
      });
    }

    qb.orderBy('d.created_at', 'DESC').skip(skipOf(query)).take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(shopId: string, id: string): Promise<DebtBookEntry> {
    const entry = await this.entries.findOne({ where: { id, shopId } });
    if (!entry) {
      throw BusinessException.notFound('Debt book entry not found');
    }
    return entry;
  }

  async update(
    shopId: string,
    id: string,
    dto: UpdateDebtBookEntryDto,
  ): Promise<DebtBookEntry> {
    const entry = await this.findOne(shopId, id);
    if (dto.borrowerName !== undefined)
      entry.borrowerName = dto.borrowerName.trim();
    if (dto.phone !== undefined) entry.phone = dto.phone?.trim() || null;
    if (dto.amount !== undefined) entry.amount = dto.amount;
    if (dto.dueDate !== undefined) entry.dueDate = dto.dueDate || null;
    if (dto.note !== undefined) entry.note = dto.note?.trim() || null;
    return this.entries.save(entry);
  }

  async remove(shopId: string, id: string): Promise<void> {
    const entry = await this.findOne(shopId, id);
    await this.entries.softRemove(entry);
  }
}
