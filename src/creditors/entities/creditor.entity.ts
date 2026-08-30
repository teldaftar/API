import { Column, Entity, Index } from 'typeorm';
import { SoftDeletableEntity, numericTransformer } from '../../common';

/**
 * Haqdorlar — money the shop owes to a person (a payable / creditor).
 * Mirrors the flat expense model: amount + who + dates + optional contact/note.
 * Soft-deletable so removals stay auditable.
 */
@Entity('creditors')
@Index('idx_creditors_shop_borrowed_at', ['shopId', 'borrowedAt'])
export class Creditor extends SoftDeletableEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  amount: number;

  /** Kimdan — the person the money was borrowed from. */
  @Column({ name: 'creditor_name', type: 'text' })
  creditorName: string;

  /** Tel nomer — optional contact for follow-up. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  /** Izoh — optional free-text note. */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** Olgan sana — when the money was taken (shop-local date). */
  @Column({ name: 'borrowed_at', type: 'date' })
  borrowedAt: string;

  /** Beradigan sana — when it is due to be returned (shop-local date). */
  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;
}
