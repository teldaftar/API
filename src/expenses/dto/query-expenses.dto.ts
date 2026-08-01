import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { DateRangeQueryDto, PaginationQueryDto } from '../../common';

export class QueryExpensesDto extends IntersectionType(
  PaginationQueryDto,
  DateRangeQueryDto,
) {
  @ApiPropertyOptional({ description: 'Match on note' })
  @IsOptional()
  @IsString()
  search?: string;
}
