import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common';
import { AccessoryKind } from '../entities/accessory.entity';

export class QuerySoldAccessoriesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Match on accessory name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: AccessoryKind,
    description:
      'Filter by kind. Omitted → ACCESSORY only (keypad phones are a separate page).',
  })
  @IsOptional()
  @IsEnum(AccessoryKind)
  kind?: AccessoryKind;
}
