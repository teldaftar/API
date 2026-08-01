import { Column, Entity, Index } from 'typeorm';
import { SoftDeletableEntity, numericTransformer } from '../../common';

@Entity('expenses')
@Index('idx_expenses_shop_spent_at', ['shopId', 'spentAt'])
export class Expense extends SoftDeletableEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  amount: number;

  @Column({ type: 'text' })
  note: string;

  @Column({ name: 'spent_at', type: 'date' })
  spentAt: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;
}
