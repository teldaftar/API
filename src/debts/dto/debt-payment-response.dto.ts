import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DebtPayment } from '../entities/debt-payment.entity';

export class DebtPaymentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() debtId: string;
  @ApiProperty() amount: number;
  @ApiProperty() paidAt: Date;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiProperty() createdAt: Date;

  static from(payment: DebtPayment): DebtPaymentResponseDto {
    return {
      id: payment.id,
      debtId: payment.debtId,
      amount: payment.amount,
      paidAt: payment.paidAt,
      note: payment.note,
      createdAt: payment.createdAt,
    };
  }
}
