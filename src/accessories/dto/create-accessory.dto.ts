import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AccessoryKind } from '../entities/accessory.entity';

export class CreateAccessoryDto {
  @ApiProperty({ example: 'USB-C kabel 1m' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({
    enum: AccessoryKind,
    default: AccessoryKind.ACCESSORY,
    description: 'ACCESSORY (default) or KEYPAD_PHONE (button phone)',
  })
  @IsOptional()
  @IsEnum(AccessoryKind)
  kind?: AccessoryKind;

  @ApiProperty({ example: 15000, description: 'Cost. 0 allowed (free intake).' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchasePrice: number;

  @ApiProperty({ example: 10, description: 'Initial stock quantity' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  salePrice?: number;

  @ApiPropertyOptional({
    example: '356938035643809',
    description: 'IMEI — only for keypad phones (KEYPAD_PHONE)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  imei?: string;

  @ApiPropertyOptional()
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
