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
import { CreateExpenseDto } from './dto/create-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { Expense } from './entities/expense.entity';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenses: Repository<Expense>,
  ) {}

  async create(
    shopId: string,
    userId: string,
    dto: CreateExpenseDto,
  ): Promise<Expense> {
    const expense = this.expenses.create({
      shopId,
      amount: dto.amount,
      note: dto.note.trim(),
      spentAt: dto.spentAt ?? todayLocalDateString(),
      createdBy: userId,
    });
    return this.expenses.save(expense);
  }

  async findAll(
    shopId: string,
    query: QueryExpensesDto,
  ): Promise<PaginatedResult<Expense>> {
    const qb = this.expenses
      .createQueryBuilder('e')
      .where('e.shop_id = :shopId', { shopId })
      .andWhere('e.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('e.note ILIKE :search', { search: `%${query.search}%` });
    }
    if (query.from) {
      qb.andWhere('e.spent_at >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('e.spent_at <= :to', { to: query.to });
    }

    qb.orderBy('e.spent_at', 'DESC')
      .addOrderBy('e.created_at', 'DESC')
      .skip(skipOf(query))
      .take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(shopId: string, id: string): Promise<Expense> {
    const expense = await this.expenses.findOne({ where: { id, shopId } });
    if (!expense) {
      throw BusinessException.notFound('Expense not found');
    }
    return expense;
  }

  async update(
    shopId: string,
    id: string,
    dto: UpdateExpenseDto,
  ): Promise<Expense> {
    const expense = await this.findOne(shopId, id);
    if (dto.amount !== undefined) expense.amount = dto.amount;
    if (dto.note !== undefined) expense.note = dto.note.trim();
    if (dto.spentAt !== undefined) expense.spentAt = dto.spentAt;
    return this.expenses.save(expense);
  }

  async remove(shopId: string, id: string): Promise<void> {
    const expense = await this.findOne(shopId, id);
    await this.expenses.softRemove(expense);
  }
}
