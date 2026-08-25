import { Column, Entity, Index, OneToMany } from 'typeorm';
import { UuidEntity, numericTransformer } from '../../common';
import { SaleItem } from './sale-item.entity';

export enum SaleType {
  PHONE = 'PHONE',
  ACCESSORY = 'ACCESSORY',
  /** A sale made up entirely of keypad ("button") phones. */
  KEYPAD_PHONE = 'KEYPAD_PHONE',
  /** A sale that bundles more than one category in one transaction. */
  MIXED = 'MIXED',
}

export enum SaleStatus {
  COMPLETED = 'COMPLETED',
  PARTIALLY_RETURNED = 'PARTIALLY_RETURNED',
  RETURNED = 'RETURNED',
}

@Entity('sales')
@Index('idx_sales_shop_sold_at', ['shopId', 'soldAt'])
@Index('idx_sales_shop_type_sold_at', ['shopId', 'type', 'soldAt'])
export class Sale extends UuidEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  /** Human-readable per-shop sequence, e.g. `S-000123`. */
  @Column({ type: 'varchar' })
  code: string;

  @Column({ type: 'enum', enum: SaleType })
  type: SaleType;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  totalAmount: number;

  @Column({
    name: 'paid_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  paidAmount: number;

  @Column({
    name: 'debt_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  debtAmount: number;

  @Column({ type: 'enum', enum: SaleStatus, default: SaleStatus.COMPLETED })
  status: SaleStatus;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** Optional buyer contact captured at sale time (for any sale, not just debt). */
  @Column({ name: 'customer_name', type: 'varchar', nullable: true })
  customerName: string | null;

  @Column({ name: 'customer_phone', type: 'varchar', nullable: true })
  customerPhone: string | null;

  @Column({ name: 'sold_by', type: 'uuid' })
  soldBy: string;

  @Column({ name: 'sold_at', type: 'timestamptz', default: () => 'now()' })
  soldAt: Date;

  @OneToMany(() => SaleItem, (item) => item.sale)
  items: SaleItem[];
}
