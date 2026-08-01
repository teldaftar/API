import { Column, Entity, Index } from 'typeorm';
import { UuidEntity, numericTransformer } from '../../common';

export enum DebtStatus {
  OPEN = 'OPEN',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

/**
 * A one-time debt tied 1:1 to a sale. No installments, no payments table —
 * settled in a single action. OVERDUE is never stored; it's computed at read
 * time as (status = OPEN AND dueDate < today).
 */
@Entity('debts')
@Index('idx_debts_shop_status_due', ['shopId', 'status', 'dueDate'])
@Index('idx_debts_sale_id', ['saleId'], { unique: true })
export class Debt extends UuidEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'sale_id', type: 'uuid' })
  saleId: string;

  @Column({ name: 'customer_name', type: 'varchar' })
  customerName: string;

  /** Normalised to `998XXXXXXXXX`. */
  @Column({ name: 'customer_phone', type: 'varchar' })
  customerPhone: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  amount: number;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ type: 'enum', enum: DebtStatus, default: DebtStatus.OPEN })
  status: DebtStatus;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
