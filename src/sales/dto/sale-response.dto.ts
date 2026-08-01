import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SaleItemType } from '../entities/sale-item.entity';
import { SaleStatus, SaleType } from '../entities/sale.entity';

export class SaleProductSnapshotDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) imei: string | null;
  @ApiPropertyOptional({ nullable: true, example: '8 GB / 256 GB' })
  memory: string | null;
  @ApiPropertyOptional({ nullable: true }) imageUrl: string | null;
}

export class SaleItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: SaleItemType }) itemType: SaleItemType;
  @ApiProperty() quantity: number;
  @ApiProperty() unitPrice: number;
  @ApiProperty() costPrice: number;
  @ApiProperty() lineTotal: number;
  @ApiProperty() returnedQuantity: number;
  @ApiProperty({ type: SaleProductSnapshotDto })
  product: SaleProductSnapshotDto;
}

export class SaleDebtSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() customerName: string;
  @ApiProperty() customerPhone: string;
  @ApiProperty() amount: number;
  @ApiProperty() dueDate: string;
  @ApiProperty() status: string;
  @ApiProperty() isOverdue: boolean;
  @ApiProperty() daysOverdue: number;
}

export class SaleResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty({ enum: SaleType }) type: SaleType;
  @ApiProperty() totalAmount: number;
  @ApiProperty() paidAmount: number;
  @ApiProperty() debtAmount: number;
  @ApiProperty({ enum: SaleStatus }) status: SaleStatus;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiProperty() soldAt: Date;

  @ApiProperty({
    description:
      'Profit net of returns: sum (unitPrice - costPrice) * (qty - returnedQty)',
  })
  profit: number;

  @ApiProperty({ type: [SaleItemResponseDto] })
  items: SaleItemResponseDto[];

  @ApiPropertyOptional({ type: SaleDebtSummaryDto, nullable: true })
  debt: SaleDebtSummaryDto | null;
}
