import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BusinessException, PaginatedResult, paginate } from '../common';
import { UploadsService } from '../uploads/uploads.service';
import { CreateAccessoryDto } from './dto/create-accessory.dto';
import { QueryAccessoriesDto } from './dto/query-accessories.dto';
import { QuerySoldAccessoriesDto } from './dto/query-sold-accessories.dto';
import {
  SoldAccessoryDetailDto,
  SoldAccessoryPriceLineDto,
  SoldAccessoryRowDto,
} from './dto/sold-accessory.dto';
import { AddStockDto, UpdateAccessoryDto } from './dto/update-accessory.dto';
import { AccessoryStockEntry } from './entities/accessory-stock-entry.entity';
import { Accessory } from './entities/accessory.entity';

/** Coerce a pg numeric/bigint (string) to number. */
function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class AccessoriesService {
  constructor(
    @InjectRepository(Accessory)
    private readonly accessories: Repository<Accessory>,
    @InjectRepository(AccessoryStockEntry)
    private readonly stockEntries: Repository<AccessoryStockEntry>,
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
  ) {}

  async create(shopId: string, dto: CreateAccessoryDto): Promise<Accessory> {
    return this.dataSource.transaction(async (manager) => {
      const accessory = await manager.getRepository(Accessory).save({
        shopId,
        name: dto.name.trim(),
        purchasePrice: dto.purchasePrice,
        salePrice: dto.salePrice ?? null,
        quantity: 0,
        imageUrl: dto.imageUrl ?? null,
        note: dto.note ?? null,
      });

      // Opening intake: writes the first stock entry and lifts quantity to dto.
      await this.applyIntake(
        manager,
        accessory,
        dto.quantity,
        dto.purchasePrice,
        dto.note ?? null,
      );

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
    const previousImage = accessory.imageUrl;

    if (dto.name !== undefined) accessory.name = dto.name.trim();
    if (dto.purchasePrice !== undefined)
      accessory.purchasePrice = dto.purchasePrice;
    if (dto.salePrice !== undefined) accessory.salePrice = dto.salePrice;
    if (dto.imageUrl !== undefined) accessory.imageUrl = dto.imageUrl;
    if (dto.note !== undefined) accessory.note = dto.note;

    const saved = await this.accessories.save(accessory);

    if (previousImage && previousImage !== saved.imageUrl) {
      await this.uploads.removeByUrl(previousImage);
    }

    return saved;
  }

  async remove(shopId: string, id: string): Promise<void> {
    const accessory = await this.findOne(shopId, id);
    const image = accessory.imageUrl;
    if (image) {
      accessory.imageUrl = null;
      await this.accessories.save(accessory);
    }
    await this.accessories.softRemove(accessory);
    if (image) {
      await this.uploads.removeByUrl(image);
    }
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
      const accessory = await this.lockAccessory(manager, shopId, id);
      await this.applyIntake(
        manager,
        accessory,
        dto.quantity,
        dto.purchasePrice,
        dto.note ?? null,
      );
      return accessory;
    });
  }

  /**
   * Lock an accessory row for a stock-mutating operation. Shared by
   * {@link addStock} and the stock-receipts flow so both take the same
   * pessimistic write lock inside their transaction.
   */
  async lockAccessory(
    manager: EntityManager,
    shopId: string,
    id: string,
  ): Promise<Accessory> {
    const accessory = await manager
      .getRepository(Accessory)
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
    return accessory;
  }

  /**
   * Apply one intake to an already-loaded accessory within an existing
   * transaction: append a stock entry (optionally tied to a receipt), bump the
   * denormalized quantity, and refresh the accessory's purchasePrice to the
   * latest cost. Mutates and saves the passed `accessory`.
   */
  async applyIntake(
    manager: EntityManager,
    accessory: Accessory,
    quantity: number,
    purchasePrice: number,
    note: string | null,
    receiptId: string | null = null,
  ): Promise<void> {
    await manager.getRepository(AccessoryStockEntry).save({
      shopId: accessory.shopId,
      accessoryId: accessory.id,
      receiptId,
      quantity,
      purchasePrice,
      note,
    });
    accessory.quantity += quantity;
    accessory.purchasePrice = purchasePrice;
    await manager.getRepository(Accessory).save(accessory);
  }

  /**
   * Recompute an accessory's `purchasePrice` from its most recent remaining
   * stock entry (max createdAt). Used after a stock receipt is edited/deleted,
   * where entries may have been replaced or removed. No-op if none remain.
   * Mutates and saves the passed `accessory`.
   */
  async refreshLatestCost(
    manager: EntityManager,
    accessory: Accessory,
  ): Promise<void> {
    const latest = await manager
      .getRepository(AccessoryStockEntry)
      .createQueryBuilder('e')
      .where('e.accessory_id = :id AND e.shop_id = :shopId', {
        id: accessory.id,
        shopId: accessory.shopId,
      })
      .orderBy('e.created_at', 'DESC')
      .addOrderBy('e.id', 'DESC')
      .limit(1)
      .getOne();
    if (latest) {
      accessory.purchasePrice = latest.purchasePrice;
      await manager.getRepository(Accessory).save(accessory);
    }
  }

  async listStock(shopId: string, id: string): Promise<AccessoryStockEntry[]> {
    await this.findOne(shopId, id); // tenant-scoped existence check
    return this.stockEntries.find({
      where: { accessoryId: id, shopId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * "Sold accessories" tab: one row per accessory that has been sold, with the
   * net quantity/amount/cost aggregated across all of its sales in SQL. Same
   * shape idea as the in-stock list, but keyed on what's been sold.
   */
  async findSold(
    shopId: string,
    query: QuerySoldAccessoriesDto,
  ): Promise<PaginatedResult<SoldAccessoryRowDto>> {
    const pattern = `%${query.search ?? ''}%`;

    const [{ total }] = await this.dataSource.query(
      `
      SELECT COUNT(*)::int AS total FROM (
        SELECT si.accessory_id
        FROM sale_items si
        JOIN accessories a ON a.id = si.accessory_id
        WHERE si.shop_id = $1 AND si.item_type = 'ACCESSORY'
          AND a.name ILIKE $2
        GROUP BY si.accessory_id
        HAVING SUM(si.quantity - si.returned_quantity) > 0
      ) x
      `,
      [shopId, pattern],
    );

    const rows = await this.dataSource.query(
      `
      SELECT a.id AS accessory_id, a.name, a.image_url,
             a.quantity AS current_quantity,
             a.purchase_price, a.sale_price,
             agg.sold_qty, agg.sold_amount, agg.sold_cost_amount
      FROM (
        SELECT si.accessory_id,
               SUM(si.quantity - si.returned_quantity) AS sold_qty,
               SUM(si.unit_price * (si.quantity - si.returned_quantity)) AS sold_amount,
               SUM(si.cost_price * (si.quantity - si.returned_quantity)) AS sold_cost_amount
        FROM sale_items si
        WHERE si.shop_id = $1 AND si.item_type = 'ACCESSORY'
        GROUP BY si.accessory_id
        HAVING SUM(si.quantity - si.returned_quantity) > 0
      ) agg
      JOIN accessories a ON a.id = agg.accessory_id
      WHERE a.name ILIKE $2
      ORDER BY agg.sold_qty DESC, a.name ASC
      LIMIT $3 OFFSET $4
      `,
      [shopId, pattern, query.limit, query.skip],
    );

    const data: SoldAccessoryRowDto[] = rows.map(
      (r: Record<string, unknown>) => {
        const soldAmount = num(r.sold_amount);
        const soldCostAmount = num(r.sold_cost_amount);
        return {
          accessoryId: r.accessory_id as string,
          name: r.name as string,
          imageUrl: (r.image_url as string) ?? null,
          soldQty: num(r.sold_qty),
          soldAmount,
          soldCostAmount,
          profit: round2(soldAmount - soldCostAmount),
          currentQuantity: num(r.current_quantity),
          purchasePrice: num(r.purchase_price),
          salePrice: r.sale_price === null ? null : num(r.sale_price),
        };
      },
    );

    return paginate(data, num(total), query.page, query.limit);
  }

  /**
   * Detail for one sold accessory: totals plus a per-price breakdown
   * ("N sold at each unit price"), so the shopkeeper sees exactly how the
   * sales split across different prices.
   */
  async soldBreakdown(
    shopId: string,
    id: string,
  ): Promise<SoldAccessoryDetailDto> {
    const accessory = await this.findOne(shopId, id);

    const lineRows = await this.dataSource.query(
      `
      SELECT si.unit_price, si.cost_price,
             SUM(si.quantity - si.returned_quantity) AS qty,
             SUM(si.unit_price * (si.quantity - si.returned_quantity)) AS amount,
             SUM(si.cost_price * (si.quantity - si.returned_quantity)) AS cost_amount
      FROM sale_items si
      WHERE si.shop_id = $1 AND si.accessory_id = $2 AND si.item_type = 'ACCESSORY'
      GROUP BY si.unit_price, si.cost_price
      HAVING SUM(si.quantity - si.returned_quantity) > 0
      ORDER BY si.unit_price DESC
      `,
      [shopId, id],
    );

    const lines: SoldAccessoryPriceLineDto[] = lineRows.map(
      (r: Record<string, unknown>) => {
        const amount = num(r.amount);
        const costAmount = num(r.cost_amount);
        return {
          unitPrice: num(r.unit_price),
          costPrice: num(r.cost_price),
          quantity: num(r.qty),
          amount,
          costAmount,
          profit: round2(amount - costAmount),
        };
      },
    );

    const soldQty = lines.reduce((s, l) => s + l.quantity, 0);
    const soldAmount = round2(lines.reduce((s, l) => s + l.amount, 0));
    const soldCostAmount = round2(lines.reduce((s, l) => s + l.costAmount, 0));

    return {
      accessoryId: accessory.id,
      name: accessory.name,
      imageUrl: accessory.imageUrl,
      currentQuantity: accessory.quantity,
      purchasePrice: accessory.purchasePrice,
      salePrice: accessory.salePrice,
      soldQty,
      soldAmount,
      soldCostAmount,
      profit: round2(soldAmount - soldCostAmount),
      lines,
    };
  }
}
