import { Column, Entity, Index } from 'typeorm';
import { SoftDeletableEntity, numericTransformer } from '../../common';

/**
 * Distinguishes plain accessories from keypad ("button") phones. Both share the
 * exact same quantity + per-batch cost-layer model, so they live in one table;
 * `kind` is the single source of truth used to split them across pages, sold
 * views, sale types and statistics.
 */
export enum AccessoryKind {
  ACCESSORY = 'ACCESSORY',
  KEYPAD_PHONE = 'KEYPAD_PHONE',
}

@Entity('accessories')
@Index('idx_accessories_shop_id', ['shopId'])
@Index('idx_accessories_shop_kind', ['shopId', 'kind'])
export class Accessory extends SoftDeletableEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({
    type: 'enum',
    enum: AccessoryKind,
    default: AccessoryKind.ACCESSORY,
  })
  kind: AccessoryKind;

  @Column({ type: 'varchar' })
  name: string;

  /**
   * Optional IMEI. Only meaningful for KEYPAD_PHONE items (a single physical
   * phone); plain accessories leave it null. Not enforced unique — a keypad
   * "accessory" row can carry a quantity, and duplicate/blank IMEIs happen.
   */
  @Column({ type: 'varchar', nullable: true })
  imei: string | null;

  /** Latest intake cost. */
  @Column({
    name: 'purchase_price',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  purchasePrice: number;

  @Column({
    name: 'sale_price',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  salePrice: number | null;

  /** Denormalized running stock total, kept in sync with stock entries + sales. */
  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ name: 'image_url', type: 'varchar', nullable: true })
  imageUrl: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;
}
