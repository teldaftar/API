import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import {
  DateRangeQueryDto,
  PaginationQueryDto,
} from '../../common';
import { IntersectionType } from '@nestjs/swagger';
import { DebtStatus } from '../entities/debt.entity';

export class QueryDebtsDto extends IntersectionType(
  PaginationQueryDto,
  DateRangeQueryDto,
) {
  @ApiPropertyOptional({ enum: DebtStatus })
  @IsOptional()
  @IsEnum(DebtStatus)
  status?: DebtStatus;

  @ApiPropertyOptional({ description: 'Only OPEN debts past their due date' })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true ? true : undefined,
  )
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ description: 'Match customer name or phone' })
  @IsOptional()
  @IsString()
  search?: string;
}
