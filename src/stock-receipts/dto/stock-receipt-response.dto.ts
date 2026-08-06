import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockReceipt } from '../entities/stock-receipt.entity';

export class StockReceiptItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() accessoryId: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) imageUrl: string | null;
  @ApiProperty() quantity: number;
  @ApiProperty() purchasePrice: number;
  @ApiProperty() lineTotal: number;
}

/** Receipt header. `items` is populated only on the detail endpoint. */
export class StockReceiptResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'P-000123' }) code: string;
  @ApiPropertyOptional({ nullable: true }) supplierName: string | null;
  @ApiPropertyOptional({ nullable: true }) supplierPhone: string | null;
  @ApiProperty() totalAmount: number;
  @ApiProperty() totalQty: number;
  @ApiProperty() itemCount: number;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiProperty() receivedAt: Date;
  @ApiPropertyOptional({ type: [StockReceiptItemResponseDto] })
  items?: StockReceiptItemResponseDto[];

  static from(
    r: StockReceipt,
    items?: StockReceiptItemResponseDto[],
  ): StockReceiptResponseDto {
    return {
      id: r.id,
      code: r.code,
      supplierName: r.supplierName,
      supplierPhone: r.supplierPhone,
      totalAmount: r.totalAmount,
      totalQty: r.totalQty,
      itemCount: r.itemCount,
      note: r.note,
      receivedAt: r.receivedAt,
      ...(items ? { items } : {}),
    };
  }
}
