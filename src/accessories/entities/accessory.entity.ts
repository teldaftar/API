import { Column, Entity, Index } from 'typeorm';
import { SoftDeletableEntity, numericTransformer } from '../../common';

@Entity('accessories')
@Index('idx_accessories_shop_id', ['shopId'])
export class Accessory extends SoftDeletableEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ type: 'varchar' })
  name: string;

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
