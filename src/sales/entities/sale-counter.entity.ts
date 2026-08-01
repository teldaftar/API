import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Per-shop monotonic counter for human-readable sale codes (S-000123).
 * Incremented under a row lock inside the sale transaction so codes never
 * collide or skip under concurrency.
 */
@Entity('sale_counters')
export class SaleCounter {
  @PrimaryColumn({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'last_value', type: 'bigint', default: 0 })
  lastValue: string;
}
