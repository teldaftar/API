import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** A brand-new accessory created inline as part of a receipt line. */
export class NewAccessoryInputDto {
  @ApiProperty({ example: 'Type-C kabel 1m' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 25000, description: 'Default sale price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  salePrice?: number;

  @ApiPropertyOptional({ example: '/uploads/abc.webp' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/**
 * One line of a receipt. Exactly one of `accessoryId` (existing accessory) or
 * `newAccessory` (create it now) must be provided — enforced in the service.
 */
export class StockReceiptLineDto {
  @ApiPropertyOptional({ description: 'Existing accessory to restock' })
  @IsOptional()
  @IsUUID()
  accessoryId?: string;

  @ApiPropertyOptional({
    type: NewAccessoryInputDto,
    description: 'Create a new accessory for this line instead',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NewAccessoryInputDto)
  newAccessory?: NewAccessoryInputDto;

  @ApiProperty({ example: 20, description: 'Quantity received' })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({
    example: 12000,
    description: 'Unit cost of this intake. 0 allowed (free intake).',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchasePrice: number;

  @ApiPropertyOptional({
    example: 25000,
    description:
      "Default sale price to set on the accessory. Updates the accessory's current salePrice (works for both existing and new accessories). Omit to leave it unchanged.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  salePrice?: number;
}

export class CreateStockReceiptDto {
  @ApiPropertyOptional({ example: 'Ali (postavshik)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierName?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  supplierPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiProperty({ type: [StockReceiptLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockReceiptLineDto)
  items: StockReceiptLineDto[];
}
