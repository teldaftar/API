import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Per-shop monotonic counter for stock-receipt codes (P-000123). Mirrors
 * {@link SaleCounter}: incremented under a row lock inside the receipt
 * transaction so codes never collide or skip under concurrency.
 */
@Entity('stock_receipt_counters')
export class StockReceiptCounter {
  @PrimaryColumn({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'last_value', type: 'bigint', default: 0 })
  lastValue: string;
}
