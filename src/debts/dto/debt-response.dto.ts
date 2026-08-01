import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DebtStatus } from '../entities/debt.entity';

export class DebtResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() saleId: string;
  @ApiProperty() saleCode: string;
  @ApiProperty() customerName: string;
  @ApiProperty() customerPhone: string;

  @ApiProperty({ description: 'Comma-joined product names on the sale' })
  productName: string;

  @ApiProperty({ description: 'Total amount of the underlying sale' })
  saleTotalAmount: number;

  @ApiProperty({ description: 'Amount already paid on the sale' })
  paidAmount: number;

  @ApiProperty({ description: 'Amount still owed' })
  amount: number;

  @ApiProperty() dueDate: string;
  @ApiProperty({ enum: DebtStatus }) status: DebtStatus;
  @ApiPropertyOptional({ nullable: true }) paidAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiProperty() isOverdue: boolean;
  @ApiProperty() daysOverdue: number;
  @ApiProperty() createdAt: Date;
}
