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

export class CreateDebtBookEntryDto {
  @ApiProperty({ example: 'Sardor', description: 'Qarz oluvchi ismi' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  borrowerName: string;

  @ApiProperty({ example: 500000, description: 'Summa' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({
    example: '+998901234567',
    description: 'Tel nomer — optional contact phone',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({
    example: '2026-10-15',
    nullable: true,
    description: 'Qaytarish sanasi (YYYY-MM-DD) — optional; null clears it',
  })
  @IsOptional()
  @IsISO8601({ strict: false })
  dueDate?: string | null;

  @ApiPropertyOptional({ description: 'Izoh — optional note' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}
