import { Column, Entity, Index } from 'typeorm';
import { UuidEntity, numericTransformer } from '../../common';

@Entity('accessory_stock_entries')
@Index('idx_accessory_stock_entries_accessory_created', [
  'accessoryId',
  'createdAt',
])
@Index('idx_accessory_stock_entries_shop_id', ['shopId'])
export class AccessoryStockEntry extends UuidEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'accessory_id', type: 'uuid' })
  accessoryId: string;

  /** Set when the intake came in through a grouped stock receipt (prixod). */
  @Column({ name: 'receipt_id', type: 'uuid', nullable: true })
  receiptId: string | null;

  @Column({ type: 'int' })
  quantity: number;

  @Column({
    name: 'purchase_price',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  purchasePrice: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
