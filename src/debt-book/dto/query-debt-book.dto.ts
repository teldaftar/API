import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { DateRangeQueryDto, PaginationQueryDto } from '../../common';

export class QueryDebtBookDto extends IntersectionType(
  PaginationQueryDto,
  DateRangeQueryDto,
) {
  @ApiPropertyOptional({ description: 'Match on borrower name, phone or note' })
  @IsOptional()
  @IsString()
  search?: string;
}
