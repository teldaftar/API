import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateExpenseDto {
  @ApiProperty({ example: 150000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'Ijara' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note: string;

  @ApiPropertyOptional({ description: 'Defaults to today (shop-local)' })
  @IsOptional()
  @IsISO8601({ strict: false })
  spentAt?: string;
}
