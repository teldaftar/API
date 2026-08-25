import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Accessory, AccessoryKind } from '../entities/accessory.entity';
import { AccessoryStockEntry } from '../entities/accessory-stock-entry.entity';

export class AccessoryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: AccessoryKind }) kind: AccessoryKind;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) imei: string | null;
  @ApiProperty() purchasePrice: number;
  @ApiPropertyOptional({ nullable: true }) salePrice: number | null;
  @ApiProperty() quantity: number;
  @ApiPropertyOptional({ nullable: true }) imageUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  static from(a: Accessory): AccessoryResponseDto {
    return {
      id: a.id,
      kind: a.kind,
      name: a.name,
      imei: a.imei,
      purchasePrice: a.purchasePrice,
      salePrice: a.salePrice,
      quantity: a.quantity,
      imageUrl: a.imageUrl,
      note: a.note,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}

export class StockEntryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() quantity: number;
  @ApiProperty({ description: 'Units from this batch still on hand (FIFO)' })
  remainingQuantity: number;
  @ApiProperty() purchasePrice: number;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiProperty() createdAt: Date;

  static from(e: AccessoryStockEntry): StockEntryResponseDto {
    return {
      id: e.id,
      quantity: e.quantity,
      remainingQuantity: e.remainingQuantity,
      purchasePrice: e.purchasePrice,
      note: e.note,
      createdAt: e.createdAt,
    };
  }
}
