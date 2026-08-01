import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../common';
import { UpdateShopDto } from './dto/update-shop.dto';
import { Shop } from './entities/shop.entity';

@Injectable()
export class ShopService {
  constructor(
    @InjectRepository(Shop)
    private readonly shops: Repository<Shop>,
  ) {}

  async findForShop(shopId: string): Promise<Shop> {
    const shop = await this.shops.findOne({ where: { id: shopId } });
    if (!shop) {
      throw BusinessException.notFound('Shop not found');
    }
    return shop;
  }

  async update(shopId: string, dto: UpdateShopDto): Promise<Shop> {
    const shop = await this.findForShop(shopId);
    Object.assign(shop, {
      name: dto.name ?? shop.name,
      address: dto.address !== undefined ? dto.address : shop.address,
      phone: dto.phone !== undefined ? dto.phone : shop.phone,
      labelFooter:
        dto.labelFooter !== undefined ? dto.labelFooter : shop.labelFooter,
    });
    return this.shops.save(shop);
  }
}
