import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
} from 'class-validator';
import { DateRangeQueryDto } from '../../common';
import { PaginationQueryDto } from '../../common';
import { PhoneCondition, PhoneStatus } from '../entities/phone.entity';
import { IntersectionType } from '@nestjs/swagger';

export class QueryPhonesDto extends IntersectionType(
  PaginationQueryDto,
  DateRangeQueryDto,
) {
  @ApiPropertyOptional({ enum: PhoneStatus })
  @IsOptional()
  @IsEnum(PhoneStatus)
  status?: PhoneStatus;

  @ApiPropertyOptional({ enum: PhoneCondition })
  @IsOptional()
  @IsEnum(PhoneCondition)
  condition?: PhoneCondition;

  @ApiPropertyOptional({ description: 'Match on name or IMEI' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description:
      'Sold-date range start (shop-local YYYY-MM-DD); filters by the sale date. For a single day set soldFrom = soldTo.',
  })
  @IsOptional()
  @IsISO8601({ strict: false })
  soldFrom?: string;

  @ApiPropertyOptional({
    example: '2026-08-31',
    description:
      'Sold-date range end (shop-local, inclusive); filters by the sale date.',
  })
  @IsOptional()
  @IsISO8601({ strict: false })
  soldTo?: string;

  @ApiPropertyOptional({
    enum: ['createdAt', 'name', 'purchasePrice', 'soldAt'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['createdAt', 'name', 'purchasePrice', 'soldAt'])
  sort?: 'createdAt' | 'name' | 'purchasePrice' | 'soldAt' = 'createdAt';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'DESC';
}
