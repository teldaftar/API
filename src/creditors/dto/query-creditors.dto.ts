import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { DateRangeQueryDto, PaginationQueryDto } from '../../common';

export class QueryCreditorsDto extends IntersectionType(
  PaginationQueryDto,
  DateRangeQueryDto,
) {
  @ApiPropertyOptional({ description: 'Match on creditor name, phone or note' })
  @IsOptional()
  @IsString()
  search?: string;
}
