import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateShopDto {
  @ApiPropertyOptional({ description: "Do'kon nomi — printed on the label" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @ApiPropertyOptional({ description: 'Footer text printed at the bottom of the label' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  labelFooter?: string;
}
