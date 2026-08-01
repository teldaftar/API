import { ApiProperty } from '@nestjs/swagger';
import { SaleReturn } from '../entities/sale-return.entity';

export class SaleReturnResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() saleItemId: string;
  @ApiProperty() quantity: number;
  @ApiProperty() amount: number;
  @ApiProperty() reason: string;
  @ApiProperty() createdAt: Date;

  static from(r: SaleReturn): SaleReturnResponseDto {
    return {
      id: r.id,
      saleItemId: r.saleItemId,
      quantity: r.quantity,
      amount: r.amount,
      reason: r.reason,
      createdAt: r.createdAt,
    };
  }
}
