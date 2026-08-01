import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

/**
 * `from`/`to` are calendar dates (YYYY-MM-DD) interpreted in shop-local time.
 * Ranges are inclusive; conversion to UTC boundaries happens in the query layer.
 */
export class DateRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-08-01', description: 'Inclusive start date (shop-local)' })
  @IsOptional()
  @IsISO8601({ strict: false })
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'Inclusive end date (shop-local)' })
  @IsOptional()
  @IsISO8601({ strict: false })
  to?: string;
}
