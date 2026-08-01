import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PhoneCondition } from '../entities/phone.entity';

export class CreatePhoneDto {
  @ApiProperty({ example: 'Samsung Galaxy A54 5G' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: '356938035643809', description: 'digits only, 10–20 chars' })
  @IsString()
  @Matches(/^\d{10,20}$/, { message: 'imei must be 10–20 digits' })
  imei: string;

  @ApiProperty({ example: 2500000, description: 'What the shop paid (UZS)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  purchasePrice: number;

  @ApiPropertyOptional({ example: 3000000, description: 'Internal reference only' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  listPrice?: number;

  @ApiPropertyOptional({ enum: PhoneCondition })
  @IsOptional()
  @IsEnum(PhoneCondition)
  condition?: PhoneCondition;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ramGb?: number;

  @ApiPropertyOptional({ example: 256 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  storageGb?: number;

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
