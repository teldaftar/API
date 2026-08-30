import { Column, Entity, Index } from 'typeorm';
import { SoftDeletableEntity, numericTransformer } from '../../common';

export enum PhoneCondition {
  NEW = 'NEW',
  USED = 'USED',
}

/** Wear grade — only meaningful when {@link PhoneCondition.USED}. */
export enum PhoneUsedGrade {
  GOOD = 'GOOD',
  MEDIUM = 'MEDIUM',
  BAD = 'BAD',
}

export enum PhoneStatus {
  IN_STOCK = 'IN_STOCK',
  SOLD = 'SOLD',
}

@Entity('phones')
@Index('idx_phones_shop_status_created', ['shopId', 'status', 'createdAt'])
@Index('idx_phones_shop_imei', ['shopId', 'imei'])
export class Phone extends SoftDeletableEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  imei: string | null;

  @Column({ name: 'supplier_name', type: 'varchar', nullable: true })
  supplierName: string | null;

  @Column({ name: 'supplier_surname', type: 'varchar', nullable: true })
  supplierSurname: string | null;

  @Column({ name: 'supplier_phone', type: 'varchar', nullable: true })
  supplierPhone: string | null;

  @Column({
    name: 'purchase_price',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  purchasePrice: number;

  @Column({
    name: 'list_price',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  listPrice: number | null;

  @Column({ type: 'enum', enum: PhoneCondition, nullable: true })
  condition: PhoneCondition | null;

  /** Wear grade; only set when {@link condition} is USED, else null. */
  @Column({
    name: 'used_grade',
    type: 'enum',
    enum: PhoneUsedGrade,
    nullable: true,
  })
  usedGrade: PhoneUsedGrade | null;

  /** Whether the phone still has its original box. Independent of condition. */
  @Column({ name: 'has_box', type: 'boolean', nullable: true })
  hasBox: boolean | null;

  /** Whether the phone comes with its charger. Independent of condition/box. */
  @Column({ name: 'has_charger', type: 'boolean', nullable: true })
  hasCharger: boolean | null;

  @Column({ name: 'ram_gb', type: 'int', nullable: true })
  ramGb: number | null;

  @Column({ name: 'storage_gb', type: 'int', nullable: true })
  storageGb: number | null;

  @Column({ name: 'image_url', type: 'varchar', nullable: true })
  imageUrl: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({
    type: 'enum',
    enum: PhoneStatus,
    default: PhoneStatus.IN_STOCK,
  })
  status: PhoneStatus;

  /**
   * Client-supplied key for retry-safe intake. Unique per shop (partial index
   * `uq_phones_shop_idempotency`) so a duplicate submit collapses to one row.
   * Null for legacy/import paths that don't send one.
   */
  @Column({ name: 'idempotency_key', type: 'uuid', nullable: true })
  idempotencyKey: string | null;
}
