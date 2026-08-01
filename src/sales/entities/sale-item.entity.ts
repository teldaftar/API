import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { UuidEntity, numericTransformer } from '../../common';
import { Sale } from './sale.entity';

export enum SaleItemType {
  PHONE = 'PHONE',
  ACCESSORY = 'ACCESSORY',
}

/**
 * DB CHECK (added in migration): exactly one of phone_id / accessory_id is set,
 * matching item_type.
 */
@Entity('sale_items')
@Index('idx_sale_items_sale_id', ['saleId'])
export class SaleItem extends UuidEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'sale_id', type: 'uuid' })
  saleId: string;

  @ManyToOne(() => Sale, (sale) => sale.items)
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'item_type', type: 'enum', enum: SaleItemType })
  itemType: SaleItemType;

  @Column({ name: 'phone_id', type: 'uuid', nullable: true })
  phoneId: string | null;

  @Column({ name: 'accessory_id', type: 'uuid', nullable: true })
  accessoryId: string | null;

  @Column({ type: 'int' })
  quantity: number;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  unitPrice: number;

  /** Snapshot of the product's purchase price at sale time — never recomputed. */
  @Column({
    name: 'cost_price',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  costPrice: number;

  @Column({
    name: 'line_total',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  lineTotal: number;

  @Column({ name: 'returned_quantity', type: 'int', default: 0 })
  returnedQuantity: number;
}
