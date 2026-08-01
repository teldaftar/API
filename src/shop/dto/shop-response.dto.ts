import { ApiProperty } from '@nestjs/swagger';
import { Shop } from '../entities/shop.entity';

export class ShopResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  address: string | null;

  @ApiProperty({ nullable: true })
  phone: string | null;

  @ApiProperty({ nullable: true })
  labelFooter: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static from(shop: Shop): ShopResponseDto {
    return {
      id: shop.id,
      name: shop.name,
      address: shop.address,
      phone: shop.phone,
      labelFooter: shop.labelFooter,
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt,
    };
  }
}
