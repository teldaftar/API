import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateReturnDto {
  @ApiProperty()
  @IsUUID()
  saleItemId: string;

  @ApiProperty({ example: 1, description: 'Units to return' })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({
    description:
      'Refund amount. Defaults to the proportional sold amount; may be lower, never higher.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  reason: string;
}
