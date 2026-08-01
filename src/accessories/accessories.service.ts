import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  BusinessException,
  PaginatedResult,
  paginate,
} from '../common';
import { CreateAccessoryDto } from './dto/create-accessory.dto';
import { QueryAccessoriesDto } from './dto/query-accessories.dto';
import { AddStockDto, UpdateAccessoryDto } from './dto/update-accessory.dto';
import { AccessoryStockEntry } from './entities/accessory-stock-entry.entity';
import { Accessory } from './entities/accessory.entity';

@Injectable()
export class AccessoriesService {
  constructor(
    @InjectRepository(Accessory)
    private readonly accessories: Repository<Accessory>,
    @InjectRepository(AccessoryStockEntry)
    private readonly stockEntries: Repository<AccessoryStockEntry>,
    private readonly dataSource: DataSource,
  ) {}

  async create(shopId: string, dto: CreateAccessoryDto): Promise<Accessory> {
    return this.dataSource.transaction(async (manager) => {
      const accessory = await manager.getRepository(Accessory).save({
        shopId,
        name: dto.name.trim(),
        purchasePrice: dto.purchasePrice,
        salePrice: dto.salePrice ?? null,
        quantity: dto.quantity,
        imageUrl: dto.imageUrl ?? null,
        note: dto.note ?? null,
      });

      // First stock entry mirrors the opening quantity.
      await manager.getRepository(AccessoryStockEntry).save({
        shopId,
        accessoryId: accessory.id,
        quantity: dto.quantity,
        purchasePrice: dto.purchasePrice,
        note: dto.note ?? null,
      });

      return accessory;
    });
  }

  async findAll(
    shopId: string,
    query: QueryAccessoriesDto,
  ): Promise<PaginatedResult<Accessory>> {
    const qb = this.accessories
      .createQueryBuilder('a')
      .where('a.shop_id = :shopId', { shopId })
      .andWhere('a.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('a.name ILIKE :search', { search: `%${query.search}%` });
    }
    if (query.inStock === true) {
      qb.andWhere('a.quantity > 0');
    } else if (query.inStock === false) {
      qb.andWhere('a.quantity = 0');
    }

    qb.orderBy('a.created_at', 'DESC').skip(query.skip).take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(shopId: string, id: string): Promise<Accessory> {
    const accessory = await this.accessories.findOne({
      where: { id, shopId },
    });
    if (!accessory) {
      throw BusinessException.notFound('Accessory not found');
    }
    return accessory;
  }

  async update(
    shopId: string,
    id: string,
    dto: UpdateAccessoryDto,
  ): Promise<Accessory> {
    const accessory = await this.findOne(shopId, id);
    if (dto.name !== undefined) accessory.name = dto.name.trim();
    if (dto.purchasePrice !== undefined)
      accessory.purchasePrice = dto.purchasePrice;
    if (dto.salePrice !== undefined) accessory.salePrice = dto.salePrice;
    if (dto.imageUrl !== undefined) accessory.imageUrl = dto.imageUrl;
    if (dto.note !== undefined) accessory.note = dto.note;
    return this.accessories.save(accessory);
  }

  async remove(shopId: string, id: string): Promise<void> {
    const accessory = await this.findOne(shopId, id);
    await this.accessories.softRemove(accessory);
  }

  /**
   * New intake: append a stock entry, bump the denormalized quantity, and set
   * the accessory's purchasePrice to the latest cost — all in one transaction.
   */
  async addStock(
    shopId: string,
    id: string,
    dto: AddStockDto,
  ): Promise<Accessory> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Accessory);
      const accessory = await repo
        .createQueryBuilder('a')
        .setLock('pessimistic_write')
        .where('a.id = :id AND a.shop_id = :shopId AND a.deleted_at IS NULL', {
          id,
          shopId,
        })
        .getOne();
      if (!accessory) {
        throw BusinessException.notFound('Accessory not found');
      }

      await manager.getRepository(AccessoryStockEntry).save({
        shopId,
        accessoryId: accessory.id,
        quantity: dto.quantity,
        purchasePrice: dto.purchasePrice,
        note: dto.note ?? null,
      });

      accessory.quantity += dto.quantity;
      accessory.purchasePrice = dto.purchasePrice;
      return repo.save(accessory);
    });
  }

  async listStock(
    shopId: string,
    id: string,
  ): Promise<AccessoryStockEntry[]> {
    await this.findOne(shopId, id); // tenant-scoped existence check
    return this.stockEntries.find({
      where: { accessoryId: id, shopId },
      order: { createdAt: 'DESC' },
    });
  }
}
