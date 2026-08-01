import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
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
    enum: ['createdAt', 'name', 'purchasePrice'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['createdAt', 'name', 'purchasePrice'])
  sort?: 'createdAt' | 'name' | 'purchasePrice' = 'createdAt';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'DESC';
}
