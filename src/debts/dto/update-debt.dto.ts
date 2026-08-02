import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateDebtDto {
  @ApiPropertyOptional({ description: 'Extend the due date' })
  @IsOptional()
  @IsISO8601({ strict: false })
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class PayDebtDto {
  @ApiProperty({
    description:
      'Payment amount. May be a partial payment; cannot exceed the remaining balance.',
    example: 1000000,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({
    description: 'Payment date; defaults to today (shop-local). May be back-dated.',
  })
  @IsOptional()
  @IsISO8601({ strict: false })
  paidAt?: string;

  @ApiPropertyOptional({ description: 'Optional note for this payment' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
