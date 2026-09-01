import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BusinessException,
  PaginatedResult,
  paginate,
  skipOf,
  todayLocalDateString,
} from '../common';
import { CreateCreditorDto } from './dto/create-creditor.dto';
import { QueryCreditorsDto } from './dto/query-creditors.dto';
import { UpdateCreditorDto } from './dto/update-creditor.dto';
import { Creditor } from './entities/creditor.entity';

@Injectable()
export class CreditorsService {
  constructor(
    @InjectRepository(Creditor)
    private readonly creditors: Repository<Creditor>,
  ) {}

  async create(
    shopId: string,
    userId: string,
    dto: CreateCreditorDto,
  ): Promise<Creditor> {
    const creditor = this.creditors.create({
      shopId,
      amount: dto.amount,
      creditorName: dto.creditorName.trim(),
      phone: dto.phone?.trim() || null,
      note: dto.note?.trim() || null,
      borrowedAt: dto.borrowedAt ?? todayLocalDateString(),
      dueDate: dto.dueDate,
      createdBy: userId,
    });
    return this.creditors.save(creditor);
  }

  async findAll(
    shopId: string,
    query: QueryCreditorsDto,
  ): Promise<PaginatedResult<Creditor>> {
    const qb = this.creditors
      .createQueryBuilder('c')
      .where('c.shop_id = :shopId', { shopId })
      .andWhere('c.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere(
        '(c.creditor_name ILIKE :search OR c.phone ILIKE :search OR c.note ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.from) {
      qb.andWhere('c.borrowed_at >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('c.borrowed_at <= :to', { to: query.to });
    }

    qb.orderBy('c.borrowed_at', 'DESC')
      .addOrderBy('c.created_at', 'DESC')
      .skip(skipOf(query))
      .take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(shopId: string, id: string): Promise<Creditor> {
    const creditor = await this.creditors.findOne({ where: { id, shopId } });
    if (!creditor) {
      throw BusinessException.notFound('Creditor not found');
    }
    return creditor;
  }

  async update(
    shopId: string,
    id: string,
    dto: UpdateCreditorDto,
  ): Promise<Creditor> {
    const creditor = await this.findOne(shopId, id);
    if (dto.amount !== undefined) creditor.amount = dto.amount;
    if (dto.creditorName !== undefined)
      creditor.creditorName = dto.creditorName.trim();
    if (dto.phone !== undefined) creditor.phone = dto.phone?.trim() || null;
    if (dto.note !== undefined) creditor.note = dto.note?.trim() || null;
    if (dto.borrowedAt !== undefined) creditor.borrowedAt = dto.borrowedAt;
    if (dto.dueDate !== undefined) creditor.dueDate = dto.dueDate;
    return this.creditors.save(creditor);
  }

  async remove(shopId: string, id: string): Promise<void> {
    const creditor = await this.findOne(shopId, id);
    await this.creditors.softRemove(creditor);
  }
}
