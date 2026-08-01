import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common';

export class QuerySoldAccessoriesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Match on accessory name' })
  @IsOptional()
  @IsString()
  search?: string;
}
