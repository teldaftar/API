import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import {
  DateRangeQueryDto,
  PaginationQueryDto,
} from '../../common';
import { IntersectionType } from '@nestjs/swagger';
import { SaleType } from '../entities/sale.entity';

export class QuerySalesDto extends IntersectionType(
  PaginationQueryDto,
  DateRangeQueryDto,
) {
  @ApiPropertyOptional({ enum: SaleType })
  @IsOptional()
  @IsEnum(SaleType)
  type?: SaleType;

  @ApiPropertyOptional({ description: 'Only sales that carry a debt' })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : undefined,
  )
  @IsBoolean()
  isDebt?: boolean;

  @ApiPropertyOptional({ description: 'Match sale code or product name/imei' })
  @IsOptional()
  @IsString()
  search?: string;
}
