import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class QueryStockReceiptsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Match on code or supplier name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Local date, inclusive',
  })
  @IsOptional()
  @Matches(DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-08-31',
    description: 'Local date, inclusive',
  })
  @IsOptional()
  @Matches(DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}
