import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Debt attached to a sale. Business validation (amount <= price, dueDate not in
 * the past, customer required) is enforced in the service so the codes match
 * the spec exactly.
 */
export class DebtInputDto {
  @ApiProperty({ example: 500000, description: 'Amount still owed' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ example: '2026-08-15', description: 'Due date (shop-local)' })
  @IsISO8601({ strict: false })
  dueDate: string;

  @ApiProperty({ example: 'Ali Valiyev' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  customerName: string;

  @ApiProperty({
    example: '998901234567',
    description: 'Normalised to 998XXXXXXXXX',
  })
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  customerPhone: string;
}
