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
import { Accessory } from '../accessories/entities/accessory.entity';
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
import { StockReceiptItem } from './entities/stock-receipt-item.entity';
import { StockReceipt } from './entities/stock-receipt.entity';

@Injectable()
export class StockReceiptsService {
  constructor(
    @InjectRepository(StockReceipt)
    private readonly receipts: Repository<StockReceipt>,
    @InjectRepository(StockReceiptItem)
    private readonly items: Repository<StockReceiptItem>,
    private readonly dataSource: DataSource,
    private readonly accessories: AccessoriesService,
  ) {}

  /**
   * Create a grouped intake. For each line either restock an existing accessory
   * or create a new one, then apply the intake (stock entry + quantity bump)
   * through the shared AccessoriesService helpers. All in one transaction.
   */
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
          : await manager.getRepository(Accessory).save({
              shopId,
              name: line.newAccessory!.name.trim(),
              purchasePrice: line.purchasePrice,
              salePrice: line.newAccessory!.salePrice ?? null,
              quantity: 0,
              imageUrl: line.newAccessory!.imageUrl ?? null,
              note: line.newAccessory!.note ?? null,
            });

        await this.accessories.applyIntake(
          manager,
          accessory,
          line.quantity,
          line.purchasePrice,
          null,
          receipt.id,
        );

        const lineTotal = this.round2(line.purchasePrice * line.quantity);
        await manager.getRepository(StockReceiptItem).save({
          shopId,
          receiptId: receipt.id,
          accessoryId: accessory.id,
          quantity: line.quantity,
          purchasePrice: line.purchasePrice,
          lineTotal,
        });

        totalAmount += lineTotal;
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
   * Edit a receipt: fully replace its line set. Applies the net quantity change
   * per accessory (delta = new − old), refuses to drop an accessory below what
   * is currently in stock (units may have been sold), then rewrites the stock
   * entries + line items and refreshes each accessory's latest cost. One
   * transaction.
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

      const oldQtyByAcc = await this.receiptQtyByAccessory(manager, shopId, id);

      // Resolve new lines → accessories (lock existing / create new), tally qty.
      const resolved: Array<{
        accessory: Accessory;
        quantity: number;
        purchasePrice: number;
      }> = [];
      const newQtyByAcc = new Map<string, number>();
      const locked = new Map<string, Accessory>();

      for (const line of dto.items) {
        let accessory: Accessory;
        if (line.accessoryId) {
          accessory =
            locked.get(line.accessoryId) ??
            (await this.accessories.lockAccessory(
              manager,
              shopId,
              line.accessoryId,
            ));
        } else {
          accessory = await manager.getRepository(Accessory).save({
            shopId,
            name: line.newAccessory!.name.trim(),
            purchasePrice: line.purchasePrice,
            salePrice: line.newAccessory!.salePrice ?? null,
            quantity: 0,
            imageUrl: line.newAccessory!.imageUrl ?? null,
            note: line.newAccessory!.note ?? null,
          });
        }
        locked.set(accessory.id, accessory);
        resolved.push({
          accessory,
          quantity: line.quantity,
          purchasePrice: line.purchasePrice,
        });
        newQtyByAcc.set(
          accessory.id,
          (newQtyByAcc.get(accessory.id) ?? 0) + line.quantity,
        );
      }

      // Lock any accessory that was only on the OLD lines (to lower its qty).
      for (const accId of oldQtyByAcc.keys()) {
        if (!locked.has(accId)) {
          locked.set(
            accId,
            await this.accessories.lockAccessory(manager, shopId, accId),
          );
        }
      }

      // Apply per-accessory delta with the sold-floor guard.
      const affected = new Set<string>([
        ...oldQtyByAcc.keys(),
        ...newQtyByAcc.keys(),
      ]);
      for (const accId of affected) {
        const accessory = locked.get(accId)!;
        const delta =
          (newQtyByAcc.get(accId) ?? 0) - (oldQtyByAcc.get(accId) ?? 0);
        const nextQty = accessory.quantity + delta;
        if (nextQty < 0) {
          throw BusinessException.conflict(
            ErrorCode.INSUFFICIENT_STOCK,
            'Cannot reduce this intake below what is already sold',
            { accessoryId: accId, available: accessory.quantity },
          );
        }
        accessory.quantity = nextQty;
      }

      // Rewrite this receipt's stock entries + line items.
      await manager
        .getRepository(AccessoryStockEntry)
        .delete({ receiptId: id, shopId });
      await manager
        .getRepository(StockReceiptItem)
        .delete({ receiptId: id, shopId });

      let totalAmount = 0;
      let totalQty = 0;
      for (const r of resolved) {
        // Preserve the receipt's date on its entries so "latest cost" ordering
        // stays chronological even when editing an older receipt.
        await manager.getRepository(AccessoryStockEntry).save({
          shopId,
          accessoryId: r.accessory.id,
          receiptId: id,
          quantity: r.quantity,
          purchasePrice: r.purchasePrice,
          note: null,
          createdAt: receipt.receivedAt,
        });
        const lineTotal = this.round2(r.purchasePrice * r.quantity);
        await manager.getRepository(StockReceiptItem).save({
          shopId,
          receiptId: id,
          accessoryId: r.accessory.id,
          quantity: r.quantity,
          purchasePrice: r.purchasePrice,
          lineTotal,
        });
        totalAmount += lineTotal;
        totalQty += r.quantity;
      }

      // Persist quantities + recompute each accessory's latest cost.
      for (const accId of affected) {
        const accessory = locked.get(accId)!;
        await manager.getRepository(Accessory).save(accessory);
        await this.accessories.refreshLatestCost(manager, accessory);
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
   * Delete a receipt: reverse its intake (subtract each line's quantity from
   * its accessory), refusing if that would drop an accessory below zero — i.e.
   * some received units have already been sold. One transaction.
   */
  async remove(shopId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const receipt = await manager
        .getRepository(StockReceipt)
        .findOne({ where: { id, shopId } });
      if (!receipt) {
        throw BusinessException.notFound('Stock receipt not found');
      }

      const oldQtyByAcc = await this.receiptQtyByAccessory(manager, shopId, id);
      const locked = new Map<string, Accessory>();

      for (const [accId, qty] of oldQtyByAcc) {
        const accessory = await this.accessories.lockAccessory(
          manager,
          shopId,
          accId,
        );
        const nextQty = accessory.quantity - qty;
        if (nextQty < 0) {
          throw BusinessException.conflict(
            ErrorCode.INSUFFICIENT_STOCK,
            'Cannot delete: some received units have already been sold',
            { accessoryId: accId, available: accessory.quantity },
          );
        }
        accessory.quantity = nextQty;
        locked.set(accId, accessory);
      }

      await manager
        .getRepository(AccessoryStockEntry)
        .delete({ receiptId: id, shopId });
      await manager
        .getRepository(StockReceiptItem)
        .delete({ receiptId: id, shopId });
      await manager.getRepository(StockReceipt).delete({ id, shopId });

      for (const accessory of locked.values()) {
        await manager.getRepository(Accessory).save(accessory);
        await this.accessories.refreshLatestCost(manager, accessory);
      }
    });
  }

  /** Each line must carry exactly one of accessoryId / newAccessory. */
  private assertLines(lines: StockReceiptLineDto[]): void {
    for (const line of lines) {
      if (Boolean(line.accessoryId) === Boolean(line.newAccessory)) {
        throw BusinessException.badRequest(
          ErrorCode.RECEIPT_LINE_INVALID,
          'Each line must have exactly one of accessoryId or newAccessory',
        );
      }
    }
  }

  /** Sum of quantities per accessory currently recorded on a receipt. */
  private async receiptQtyByAccessory(
    manager: EntityManager,
    shopId: string,
    receiptId: string,
  ): Promise<Map<string, number>> {
    const rows = await manager
      .getRepository(StockReceiptItem)
      .find({ where: { receiptId, shopId } });
    const byAcc = new Map<string, number>();
    for (const it of rows) {
      byAcc.set(it.accessoryId, (byAcc.get(it.accessoryId) ?? 0) + it.quantity);
    }
    return byAcc;
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

    const items = await this.items.find({ where: { receiptId: id, shopId } });
    const accessories = items.length
      ? await this.dataSource.getRepository(Accessory).find({
          where: { id: In(items.map((i) => i.accessoryId)), shopId },
          withDeleted: true,
        })
      : [];
    const accMap = new Map(accessories.map((a) => [a.id, a]));

    const itemDtos: StockReceiptItemResponseDto[] = items.map((i) => {
      const acc = accMap.get(i.accessoryId);
      return {
        id: i.id,
        accessoryId: i.accessoryId,
        name: acc?.name ?? '',
        imageUrl: acc?.imageUrl ?? null,
        quantity: i.quantity,
        purchasePrice: i.purchasePrice,
        lineTotal: i.lineTotal,
      };
    });

    return StockReceiptResponseDto.from(receipt, itemDtos);
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
