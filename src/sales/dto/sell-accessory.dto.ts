import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DebtInputDto } from './debt-input.dto';

export class SellAccessoryDto {
  @ApiProperty()
  @IsUUID()
  accessoryId: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({
    example: 25000,
    description: 'Defaults to the accessory salePrice when omitted',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ type: DebtInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DebtInputDto)
  debt?: DebtInputDto;
}
