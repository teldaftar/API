import { Column, Entity, Index } from 'typeorm';
import { SoftDeletableEntity, numericTransformer } from '../../common';

/**
 * Qarz daftari — a manual ledger of money a person owes the shop, independent
 * of sales (sale-linked debts live in `debts`). Mirror of `creditors`:
 * amount + who + optional contact/due date/note. Soft-deletable.
 */
@Entity('debt_book_entries')
@Index('idx_debt_book_entries_shop_created_at', ['shopId', 'createdAt'])
export class DebtBookEntry extends SoftDeletableEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  /** Qarz oluvchi — the person who took the money/goods. */
  @Column({ name: 'borrower_name', type: 'text' })
  borrowerName: string;

  /** Tel nomer — optional contact for follow-up. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  amount: number;

  /** Qaytarish sanasi — optional due date (shop-local date). */
  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  /** Izoh — optional free-text note. */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;
}
