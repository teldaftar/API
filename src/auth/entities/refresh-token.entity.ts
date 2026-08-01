import { Column, Entity, Index } from 'typeorm';
import { UuidEntity } from '../../common';

@Entity('refresh_tokens')
@Index('idx_refresh_tokens_user_id', ['userId'])
export class RefreshToken extends UuidEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** SHA-256 of the raw refresh token; the raw token is never stored. */
  @Column({ name: 'token_hash', type: 'varchar' })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
