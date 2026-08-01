import { ApiProperty } from '@nestjs/swagger';
import { Expense } from '../entities/expense.entity';

export class ExpenseResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() amount: number;
  @ApiProperty() note: string;
  @ApiProperty() spentAt: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  static from(e: Expense): ExpenseResponseDto {
    return {
      id: e.id,
      amount: e.amount,
      note: e.note,
      spentAt: e.spentAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
