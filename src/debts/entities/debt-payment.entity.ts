import { Column, Entity, Index } from 'typeorm';
import { UuidEntity, numericTransformer } from '../../common';

/**
 * A single payment made against a debt. A debt can have many payments
 * (installments) — the debt is settled (status = PAID) once the sum of its
 * payments covers the outstanding amount. Kept as an append-only ledger so the
 * full payment history (amount + date) is always visible.
 */
@Entity('debt_payments')
@Index('idx_debt_payments_debt_id', ['debtId'])
@Index('idx_debt_payments_shop_paid_at', ['shopId', 'paidAt'])
export class DebtPayment extends UuidEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'debt_id', type: 'uuid' })
  debtId: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  amount: number;

  /** When the money was actually received (may be back-dated by the owner). */
  @Column({ name: 'paid_at', type: 'timestamptz', default: () => 'now()' })
  paidAt: Date;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
