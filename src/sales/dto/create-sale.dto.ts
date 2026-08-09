import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SaleItemType } from '../entities/sale-item.entity';
import { DebtInputDto } from './debt-input.dto';

/**
 * One line of a multi-item sale. Exactly one product kind per line:
 * - PHONE: `phoneId` required, quantity is always 1.
 * - ACCESSORY: `accessoryId` + `stockEntryId` (the chosen FIFO batch) +
 *   `quantity` required. The seller picks which batch (price) to sell from, so
 *   the cost snapshot is that batch's purchase price.
 * Cross-field requirements are enforced in the service (SALE_LINE_INVALID).
 */
export class SaleLineDto {
  @ApiProperty({ enum: SaleItemType })
  @IsEnum(SaleItemType)
  type: SaleItemType;

  @ApiPropertyOptional({ description: 'Required when type = PHONE' })
  @IsOptional()
  @IsUUID()
  phoneId?: string;

  @ApiPropertyOptional({ description: 'Required when type = ACCESSORY' })
  @IsOptional()
  @IsUUID()
  accessoryId?: string;

  @ApiPropertyOptional({
    description:
      'Required when type = ACCESSORY — the stock batch (prixod layer) to sell from',
  })
  @IsOptional()
  @IsUUID()
  stockEntryId?: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'Units to sell (ACCESSORY only; phones are always 1)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity?: number;

  @ApiProperty({ example: 25000, description: 'Negotiated unit sale price' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  unitPrice: number;
}

export class CreateSaleDto {
  @ApiProperty({ type: [SaleLineDto], description: 'At least one line' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleLineDto)
  items: SaleLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({
    example: 'Ali Valiyev',
    description: 'Optional buyer name for follow-up (not required).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional({
    example: '+998901234567',
    description: 'Optional buyer phone for follow-up (not required).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;

  @ApiPropertyOptional({ type: DebtInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DebtInputDto)
  debt?: DebtInputDto;
}
