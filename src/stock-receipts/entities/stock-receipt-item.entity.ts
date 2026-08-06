import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { UuidEntity, numericTransformer } from '../../common';
import { StockReceipt } from './stock-receipt.entity';

/** One accessory line within a {@link StockReceipt}. */
@Entity('stock_receipt_items')
@Index('idx_stock_receipt_items_receipt_id', ['receiptId'])
@Index('idx_stock_receipt_items_accessory_id', ['accessoryId'])
export class StockReceiptItem extends UuidEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'receipt_id', type: 'uuid' })
  receiptId: string;

  @ManyToOne(() => StockReceipt, (receipt) => receipt.items)
  @JoinColumn({ name: 'receipt_id' })
  receipt: StockReceipt;

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

  @Column({
    name: 'line_total',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  lineTotal: number;
}
