import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DebtInputDto } from './debt-input.dto';

export class SellPhoneDto {
  @ApiProperty()
  @IsUUID()
  phoneId: string;

  @ApiProperty({ example: 3000000, description: 'Negotiated sale price' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({
    example: 'Ali Valiyev',
    description: 'Optional buyer name for follow-up (not required).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional({
    example: '+998901234567',
    description: 'Optional buyer phone for follow-up (not required).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;

  @ApiPropertyOptional({ type: DebtInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DebtInputDto)
  debt?: DebtInputDto;
}
