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
