import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { QueryStatisticsDto } from './query-statistics.dto';

/**
 * Which slice of the shop the Excel report covers. `ALL` exports everything;
 * the others narrow every sheet to one product category (and drop the sheets
 * that have no meaning for it — e.g. expenses / creditors are shop-wide).
 */
export enum ExportScope {
  ALL = 'ALL',
  PHONE = 'PHONE',
  ACCESSORY = 'ACCESSORY',
  KEYPAD_PHONE = 'KEYPAD_PHONE',
}

export class ExportStatisticsDto extends QueryStatisticsDto {
  @ApiPropertyOptional({ enum: ExportScope, default: ExportScope.ALL })
  @IsOptional()
  @IsEnum(ExportScope)
  scope?: ExportScope;
}
