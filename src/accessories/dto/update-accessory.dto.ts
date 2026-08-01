import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';
import { CreateAccessoryDto } from './create-accessory.dto';

/**
 * Editable accessory fields. `quantity` is intentionally excluded — stock only
 * changes through stock entries and sales, never by direct edit.
 */
export class UpdateAccessoryDto extends PartialType(
  OmitType(CreateAccessoryDto, ['quantity'] as const),
) {}

export class AddStockDto {
  @ApiProperty({ example: 20, description: 'Quantity to add' })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: 16000, description: 'Cost of this intake' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  purchasePrice: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note?: string;
}
