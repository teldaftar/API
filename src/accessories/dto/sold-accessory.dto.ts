import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** One row in the "sold accessories" tab — aggregated across every sale. */
export class SoldAccessoryRowDto {
  @ApiProperty() accessoryId: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) imageUrl: string | null;

  @ApiProperty({ description: 'Total units sold, net of returns' })
  soldQty: number;

  @ApiProperty({ description: 'Total sold amount (sotilgan), net of returns' })
  soldAmount: number;

  @ApiProperty({ description: 'Total cost of what was sold (olingan), net of returns' })
  soldCostAmount: number;

  @ApiProperty({ description: 'soldAmount - soldCostAmount' })
  profit: number;

  @ApiProperty({ description: 'Current remaining stock (snapshot)' })
  currentQuantity: number;

  @ApiProperty({ description: 'Latest purchase cost (snapshot)' })
  purchasePrice: number;

  @ApiPropertyOptional({ nullable: true, description: 'Default sale price (snapshot)' })
  salePrice: number | null;
}

/** One price point inside a sold accessory: "N sold at this unit price". */
export class SoldAccessoryPriceLineDto {
  @ApiProperty({ description: 'Sold unit price (sotilgan narx)' })
  unitPrice: number;

  @ApiProperty({ description: 'Cost snapshot for these units (olingan narx)' })
  costPrice: number;

  @ApiProperty({ description: 'Units sold at this price, net of returns' })
  quantity: number;

  @ApiProperty({ description: 'unitPrice * quantity' })
  amount: number;

  @ApiProperty({ description: 'costPrice * quantity' })
  costAmount: number;

  @ApiProperty({ description: 'amount - costAmount' })
  profit: number;
}

/** Detail for a single sold accessory: totals + per-price breakdown. */
export class SoldAccessoryDetailDto {
  @ApiProperty() accessoryId: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) imageUrl: string | null;
  @ApiProperty() currentQuantity: number;
  @ApiProperty() purchasePrice: number;
  @ApiPropertyOptional({ nullable: true }) salePrice: number | null;

  @ApiProperty() soldQty: number;
  @ApiProperty() soldAmount: number;
  @ApiProperty() soldCostAmount: number;
  @ApiProperty() profit: number;

  @ApiProperty({ type: [SoldAccessoryPriceLineDto] })
  lines: SoldAccessoryPriceLineDto[];
}
