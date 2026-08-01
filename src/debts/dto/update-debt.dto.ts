import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

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
  @ApiPropertyOptional({
    description: 'Settlement date; defaults to today (shop-local)',
  })
  @IsOptional()
  @IsISO8601({ strict: false })
  paidAt?: string;
}
