import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DebtBookEntry } from '../entities/debt-book-entry.entity';

export class DebtBookEntryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() borrowerName: string;
  @ApiPropertyOptional({ nullable: true }) phone: string | null;
  @ApiProperty() amount: number;
  @ApiPropertyOptional({ nullable: true }) dueDate: string | null;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  static from(e: DebtBookEntry): DebtBookEntryResponseDto {
    return {
      id: e.id,
      borrowerName: e.borrowerName,
      phone: e.phone,
      amount: e.amount,
      dueDate: e.dueDate,
      note: e.note,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
