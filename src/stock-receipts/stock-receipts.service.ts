import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  BusinessException,
  ErrorCode,
  PaginatedResult,
  paginate,
  localDateStartUtc,
  localDateEndExclusiveUtc,
} from '../common';
import { AccessoriesService } from '../accessories/accessories.service';
import { AccessoryStockEntry } from '../accessories/entities/accessory-stock-entry.entity';
import {
  Accessory,
  AccessoryKind,
} from '../accessories/entities/accessory.entity';
import {
  CreateStockReceiptDto,
  StockReceiptLineDto,
} from './dto/create-stock-receipt.dto';
import { UpdateStockReceiptDto } from './dto/update-stock-receipt.dto';
import { QueryStockReceiptsDto } from './dto/query-stock-receipts.dto';
import {
  StockReceiptItemResponseDto,
  StockReceiptResponseDto,
} from './dto/stock-receipt-response.dto';
import { StockReceiptCounter } from './entities/stock-receipt-counter.entity';
import { StockReceipt } from './entities/stock-receipt.entity';

/**
 * A receipt's lines ARE the FIFO layers it created (`accessory_stock_entries`
 * tagged with the receipt id). There's no separate line table: create/edit/
 * delete manage those layers directly, and each accessory appears at most once
 * per receipt so a line maps 1:1 to a layer by (receipt_id, accessory_id).
 */
@Injectable()
export class StockReceiptsService {
  constructor(
    @InjectRepository(StockReceipt)
    private readonly receipts: Repository<StockReceipt>,
    @InjectRepository(AccessoryStockEntry)
    private readonly layers: Repository<AccessoryStockEntry>,
    @InjectRepository(Accessory)
    private readonly accessoryRepo: Repository<Accessory>,
    private readonly dataSource: DataSource,
    private readonly accessories: AccessoriesService,
  ) {}

  async create(
    shopId: string,
    userId: string,
    dto: CreateStockReceiptDto,
  ): Promise<StockReceiptResponseDto> {
    this.assertLines(dto.items);

    const receiptId = await this.dataSource.transaction(async (manager) => {
      const receipt = await manager.getRepository(StockReceipt).save({
        shopId,
        code: await this.nextReceiptCode(manager, shopId),
        supplierName: dto.supplierName?.trim() || null,
        supplierPhone: dto.supplierPhone?.trim() || null,
        totalAmount: 0,
        totalQty: 0,
        itemCount: dto.items.length,
        note: dto.note ?? null,
        createdBy: userId,
      });

      let totalAmount = 0;
      let totalQty = 0;
      for (const line of dto.items) {
        const accessory = line.accessoryId
          ? await this.accessories.lockAccessory(
              manager,
              shopId,
              line.accessoryId,
            )
          : await this.createInlineAccessory(manager, shopId, line);

        // Update the accessory's default sale price if the line carries one
        // (new accessories already took it via createInlineAccessory). The
        // recalc inside applyIntake persists it.
        if (line.accessoryId && line.salePrice !== undefined) {
          accessory.salePrice = line.salePrice;
        }

        await this.accessories.applyIntake(
          manager,
          accessory,
          line.quantity,
          line.purchasePrice,
          null,
          receipt.id,
        );
        totalAmount += this.round2(line.purchasePrice * line.quantity);
        totalQty += line.quantity;
      }

      receipt.totalAmount = this.round2(totalAmount);
      receipt.totalQty = totalQty;
      await manager.getRepository(StockReceipt).save(receipt);

      return receipt.id;
    });

    return this.findOne(shopId, receiptId);
  }

  /**
   * Edit a receipt: reconcile its layers against the new line set. Each layer
   * is matched by accessory; an existing layer's quantity can't drop below what
   * it has already given to sales (`quantity − remaining`), a removed line's
   * layer must be untouched by sales, and new lines create fresh layers. Then
   * every affected accessory is recomputed. One transaction.
   */
  async update(
    shopId: string,
    id: string,
    dto: UpdateStockReceiptDto,
  ): Promise<StockReceiptResponseDto> {
    this.assertLines(dto.items);

    await this.dataSource.transaction(async (manager) => {
      const receipt = await manager
        .getRepository(StockReceipt)
        .findOne({ where: { id, shopId } });
      if (!receipt) {
        throw BusinessException.notFound('Stock receipt not found');
      }

      const layerRepo = manager.getRepository(AccessoryStockEntry);
      const existing = await layerRepo.find({
        where: { receiptId: id, shopId },
      });
      const layerByAcc = new Map(existing.map((l) => [l.accessoryId, l]));

      const touched = new Map<string, Accessory>();
      const keptAccessoryIds = new Set<string>();

      let totalAmount = 0;
      let totalQty = 0;

      for (const line of dto.items) {
        const accessory = line.accessoryId
          ? await this.accessories.lockAccessory(
              manager,
              shopId,
              line.accessoryId,
            )
          : await this.createInlineAccessory(manager, shopId, line);
        touched.set(accessory.id, accessory);
        keptAccessoryIds.add(accessory.id);

        // Update the accessory's default sale price if provided (persisted by
        // the recalcAccessory pass below).
        if (line.accessoryId && line.salePrice !== undefined) {
          accessory.salePrice = line.salePrice;
        }

        const layer = layerByAcc.get(accessory.id);
        if (layer) {
          const consumed = layer.quantity - layer.remainingQuantity;
          if (line.quantity < consumed) {
            throw BusinessException.conflict(
              ErrorCode.INSUFFICIENT_STOCK,
              'Cannot reduce this line below what has already been sold',
              { accessoryId: accessory.id, minQuantity: consumed },
            );
          }
          layer.quantity = line.quantity;
          layer.remainingQuantity = line.quantity - consumed;
          layer.purchasePrice = line.purchasePrice;
          await layerRepo.save(layer);
        } else {
          await layerRepo.save({
            shopId,
            accessoryId: accessory.id,
            receiptId: id,
            saleReturnId: null,
            quantity: line.quantity,
            remainingQuantity: line.quantity,
            purchasePrice: line.purchasePrice,
            note: null,
            // Keep the receipt's date on its layers so FIFO order is stable.
            createdAt: receipt.receivedAt,
          });
        }

        totalAmount += this.round2(line.purchasePrice * line.quantity);
        totalQty += line.quantity;
      }

      // Lines dropped from the receipt: only removable if nothing was sold.
      for (const layer of existing) {
        if (keptAccessoryIds.has(layer.accessoryId)) continue;
        if (layer.quantity !== layer.remainingQuantity) {
          throw BusinessException.conflict(
            ErrorCode.INSUFFICIENT_STOCK,
            'Cannot remove a line whose units have already been sold',
            { accessoryId: layer.accessoryId },
          );
        }
        await layerRepo.delete({ id: layer.id });
        if (!touched.has(layer.accessoryId)) {
          touched.set(
            layer.accessoryId,
            await this.accessories.lockAccessory(
              manager,
              shopId,
              layer.accessoryId,
            ),
          );
        }
      }

      for (const accessory of touched.values()) {
        await this.accessories.recalcAccessory(manager, accessory);
      }

      receipt.itemCount = dto.items.length;
      receipt.totalAmount = this.round2(totalAmount);
      receipt.totalQty = totalQty;
      if (dto.note !== undefined) receipt.note = dto.note ?? null;
      if (dto.supplierName !== undefined)
        receipt.supplierName = dto.supplierName?.trim() || null;
      if (dto.supplierPhone !== undefined)
        receipt.supplierPhone = dto.supplierPhone?.trim() || null;
      await manager.getRepository(StockReceipt).save(receipt);
    });

    return this.findOne(shopId, id);
  }

  /**
   * Delete a receipt: allowed only if none of its layers have been sold from
   * (each layer still fully remaining). Removes the layers + receipt and
   * recomputes each affected accessory. One transaction.
   */
  async remove(shopId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const receipt = await manager
        .getRepository(StockReceipt)
        .findOne({ where: { id, shopId } });
      if (!receipt) {
        throw BusinessException.notFound('Stock receipt not found');
      }

      const layerRepo = manager.getRepository(AccessoryStockEntry);
      const existing = await layerRepo.find({
        where: { receiptId: id, shopId },
      });

      const touched = new Map<string, Accessory>();
      for (const layer of existing) {
        if (layer.quantity !== layer.remainingQuantity) {
          throw BusinessException.conflict(
            ErrorCode.INSUFFICIENT_STOCK,
            'Cannot delete: some received units have already been sold',
            { accessoryId: layer.accessoryId },
          );
        }
        if (!touched.has(layer.accessoryId)) {
          touched.set(
            layer.accessoryId,
            await this.accessories.lockAccessory(
              manager,
              shopId,
              layer.accessoryId,
            ),
          );
        }
      }

      await layerRepo.delete({ receiptId: id, shopId });
      await manager.getRepository(StockReceipt).delete({ id, shopId });

      for (const accessory of touched.values()) {
        await this.accessories.recalcAccessory(manager, accessory);
      }
    });
  }

  async findAll(
    shopId: string,
    query: QueryStockReceiptsDto,
  ): Promise<PaginatedResult<StockReceiptResponseDto>> {
    const qb = this.receipts
      .createQueryBuilder('r')
      .where('r.shop_id = :shopId', { shopId });

    if (query.search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('r.code ILIKE :s', { s: `%${query.search}%` }).orWhere(
            'r.supplier_name ILIKE :s',
            { s: `%${query.search}%` },
          );
        }),
      );
    }
    if (query.from) {
      qb.andWhere('r.received_at >= :from', {
        from: localDateStartUtc(query.from),
      });
    }
    if (query.to) {
      qb.andWhere('r.received_at < :toExclusive', {
        toExclusive: localDateEndExclusiveUtc(query.to),
      });
    }

    qb.orderBy('r.received_at', 'DESC').skip(query.skip).take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return paginate(
      data.map((r) => StockReceiptResponseDto.from(r)),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(shopId: string, id: string): Promise<StockReceiptResponseDto> {
    const receipt = await this.receipts.findOne({ where: { id, shopId } });
    if (!receipt) {
      throw BusinessException.notFound('Stock receipt not found');
    }

    const lines = await this.layers.find({
      where: { receiptId: id, shopId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const accessories = lines.length
      ? await this.accessoryRepo.find({
          where: { id: In(lines.map((l) => l.accessoryId)), shopId },
          withDeleted: true,
        })
      : [];
    const accMap = new Map(accessories.map((a) => [a.id, a]));

    const items: StockReceiptItemResponseDto[] = lines.map((l) => {
      const acc = accMap.get(l.accessoryId);
      return {
        id: l.id,
        accessoryId: l.accessoryId,
        kind: acc?.kind ?? AccessoryKind.ACCESSORY,
        name: acc?.name ?? '',
        imageUrl: acc?.imageUrl ?? null,
        quantity: l.quantity,
        remaining: l.remainingQuantity,
        purchasePrice: l.purchasePrice,
        salePrice: acc?.salePrice ?? null,
        lineTotal: this.round2(l.purchasePrice * l.quantity),
      };
    });

    return StockReceiptResponseDto.from(receipt, items);
  }

  private async createInlineAccessory(
    manager: EntityManager,
    shopId: string,
    line: StockReceiptLineDto,
  ): Promise<Accessory> {
    return manager.getRepository(Accessory).save({
      shopId,
      kind: line.newAccessory!.kind ?? AccessoryKind.ACCESSORY,
      name: line.newAccessory!.name.trim(),
      purchasePrice: line.purchasePrice,
      // Line-level salePrice wins; fall back to the nested one.
      salePrice: line.salePrice ?? line.newAccessory!.salePrice ?? null,
      quantity: 0,
      imageUrl: line.newAccessory!.imageUrl ?? null,
      note: line.newAccessory!.note ?? null,
    });
  }

  /** Each line carries exactly one of accessoryId / newAccessory, and no two
   * lines target the same existing accessory (one layer per accessory). */
  private assertLines(lines: StockReceiptLineDto[]): void {
    const seen = new Set<string>();
    for (const line of lines) {
      if (Boolean(line.accessoryId) === Boolean(line.newAccessory)) {
        throw BusinessException.badRequest(
          ErrorCode.RECEIPT_LINE_INVALID,
          'Each line must have exactly one of accessoryId or newAccessory',
        );
      }
      if (line.accessoryId) {
        if (seen.has(line.accessoryId)) {
          throw BusinessException.badRequest(
            ErrorCode.RECEIPT_LINE_INVALID,
            'The same accessory cannot appear twice in one receipt',
          );
        }
        seen.add(line.accessoryId);
      }
    }
  }

  private async nextReceiptCode(
    manager: EntityManager,
    shopId: string,
  ): Promise<string> {
    const repo = manager.getRepository(StockReceiptCounter);
    let counter = await repo
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.shop_id = :shopId', { shopId })
      .getOne();

    if (!counter) {
      await repo.insert({ shopId, lastValue: '0' });
      counter = await repo
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.shop_id = :shopId', { shopId })
        .getOne();
    }

    const next = parseInt(counter!.lastValue, 10) + 1;
    counter!.lastValue = String(next);
    await repo.save(counter!);
    return `P-${String(next).padStart(6, '0')}`;
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
