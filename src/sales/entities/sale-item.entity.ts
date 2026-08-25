import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { UuidEntity, numericTransformer } from '../../common';
import { Sale } from './sale.entity';

export enum SaleItemType {
  PHONE = 'PHONE',
  ACCESSORY = 'ACCESSORY',
  /**
   * Keypad ("button") phone — mechanically an accessory line (uses accessory_id
   * + a chosen stock batch), tagged separately so sales/stats can report it on
   * its own. See {@link AccessoryKind}.
   */
  KEYPAD_PHONE = 'KEYPAD_PHONE',
}

/**
 * DB CHECK (added in migration): a PHONE line carries phone_id; any non-PHONE
 * line (ACCESSORY or KEYPAD_PHONE) carries accessory_id — exactly one of the
 * two id columns is ever set.
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
