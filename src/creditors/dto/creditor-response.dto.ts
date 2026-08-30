import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Creditor } from '../entities/creditor.entity';

export class CreditorResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() amount: number;
  @ApiProperty() creditorName: string;
  @ApiPropertyOptional({ nullable: true }) phone: string | null;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiProperty() borrowedAt: string;
  @ApiProperty() dueDate: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  static from(c: Creditor): CreditorResponseDto {
    return {
      id: c.id,
      amount: c.amount,
      creditorName: c.creditorName,
      phone: c.phone,
      note: c.note,
      borrowedAt: c.borrowedAt,
      dueDate: c.dueDate,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
