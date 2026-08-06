import { Column, Entity, Index, OneToMany } from 'typeorm';
import { UuidEntity, numericTransformer } from '../../common';
import { StockReceiptItem } from './stock-receipt-item.entity';

/**
 * A grouped accessory intake ("prixod / kirim") — one document covering many
 * accessory lines received together. Each line also writes an
 * `accessory_stock_entries` row (linked by `receipt_id`) and bumps the
 * accessory's running quantity, so stats keep reading intake from that log.
 */
@Entity('stock_receipts')
@Index('idx_stock_receipts_shop_received', ['shopId', 'receivedAt'])
export class StockReceipt extends UuidEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  /** Human-readable per-shop sequence, e.g. `P-000123`. */
  @Column({ type: 'varchar' })
  code: string;

  @Column({ name: 'supplier_name', type: 'varchar', nullable: true })
  supplierName: string | null;

  @Column({ name: 'supplier_phone', type: 'varchar', nullable: true })
  supplierPhone: string | null;

  /** Denormalized totals across all lines, for fast list rendering. */
  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  totalAmount: number;

  @Column({ name: 'total_qty', type: 'int' })
  totalQty: number;

  @Column({ name: 'item_count', type: 'int' })
  itemCount: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'received_at', type: 'timestamptz', default: () => 'now()' })
  receivedAt: Date;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @OneToMany(() => StockReceiptItem, (item) => item.receipt)
  items: StockReceiptItem[];
}
