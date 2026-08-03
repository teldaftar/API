import { Column, Entity, Index } from 'typeorm';
import { SoftDeletableEntity, numericTransformer } from '../../common';

export enum PhoneCondition {
  NEW = 'NEW',
  MEDIUM = 'MEDIUM',
  USED = 'USED',
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
}
