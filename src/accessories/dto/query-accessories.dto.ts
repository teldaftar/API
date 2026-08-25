import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common';
import { AccessoryKind } from '../entities/accessory.entity';

export class QueryAccessoriesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Match on name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: AccessoryKind,
    description:
      'Filter by kind. Omitted → ACCESSORY only (keypad phones are a separate page).',
  })
  @IsOptional()
  @IsEnum(AccessoryKind)
  kind?: AccessoryKind;

  @ApiPropertyOptional({
    description: 'true → only quantity > 0, false → only quantity = 0',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : undefined,
  )
  @IsBoolean()
  inStock?: boolean;
}
