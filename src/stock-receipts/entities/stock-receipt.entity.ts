import { Column, Entity, Index } from 'typeorm';
import { UuidEntity, numericTransformer } from '../../common';

/**
 * A grouped accessory intake ("prixod / kirim") — one document covering many
 * accessory lines received together. Its lines ARE the FIFO layers it created:
 * `accessory_stock_entries` rows tagged with this receipt's `receipt_id`.
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
}
