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

export class CreateCreditorDto {
  @ApiProperty({ example: 5000000, description: 'Summa — amount owed' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'Akmal aka', description: 'Kimdan — creditor name' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  creditorName: string;

  @ApiPropertyOptional({
    example: '+998901234567',
    description: 'Tel nomer — optional contact phone',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ description: 'Izoh — optional note' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({
    description: 'Olgan sana — defaults to today (shop-local)',
  })
  @IsOptional()
  @IsISO8601({ strict: false })
  borrowedAt?: string;

  @ApiProperty({ description: 'Beradigan sana — due date to return' })
  @IsISO8601({ strict: false })
  dueDate: string;
}
