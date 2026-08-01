import { Column, Entity, Index } from 'typeorm';
import { TimestampedEntity } from '../../common';

export enum UserRole {
  OWNER = 'OWNER',
}

@Entity('users')
@Index('idx_users_shop_id', ['shopId'])
export class User extends TimestampedEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'full_name', type: 'varchar' })
  fullName: string;

  /** citext, globally unique, stored lowercase. */
  @Column({ type: 'citext', unique: true })
  login: string;

  @Column({ name: 'password_hash', type: 'varchar' })
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.OWNER,
  })
  role: UserRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
