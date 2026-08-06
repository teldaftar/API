import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
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
import { PhoneCondition, PhoneUsedGrade } from '../entities/phone.entity';

export class CreatePhoneDto {
  @ApiProperty({ example: 'Samsung Galaxy A54 5G' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({
    example: '356938035643809',
    description: 'Optional. No length limit (supports dual-IMEI entries).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imei?: string;

  @ApiPropertyOptional({
    example: 'Ali',
    description: "Supplier's first name — who the shop bought the phone from.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierName?: string;

  @ApiPropertyOptional({ example: 'Valiyev', description: "Supplier's surname." })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierSurname?: string;

  @ApiPropertyOptional({
    example: '+998901234567',
    description: 'Supplier phone number for follow-up contact.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  supplierPhone?: string;

  @ApiProperty({
    example: 2500000,
    description: 'What the shop paid (UZS). 0 allowed (free intake).',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
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

  @ApiPropertyOptional({
    enum: PhoneUsedGrade,
    description: "Wear grade. Only allowed when condition is USED.",
  })
  @IsOptional()
  @IsEnum(PhoneUsedGrade)
  usedGrade?: PhoneUsedGrade;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the phone has its original box. Independent of condition.',
  })
  @IsOptional()
  @IsBoolean()
  hasBox?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'Whether the phone comes with its charger. Independent of condition and box.',
  })
  @IsOptional()
  @IsBoolean()
  hasCharger?: boolean;

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
