import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { BusinessException, ErrorCode } from '../common';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from './entities/user.entity';
import { AccessTokenPayload } from './guards/jwt-auth.guard';
import { TokenPairDto } from './dto/auth-response.dto';

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private accessTtlSeconds(): number {
    const ttl = this.config.getOrThrow<string>('JWT_ACCESS_TTL');
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 900;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1;
    return value * factor;
  }

  /** Issue a fresh access+refresh pair and persist the hashed refresh token. */
  async issuePair(user: User, manager?: EntityManager): Promise<TokenPairDto> {
    const runner = manager ?? this.dataSource.manager;

    const payload: AccessTokenPayload = {
      sub: user.id,
      shopId: user.shopId,
      login: user.login,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_TTL'),
    } as JwtSignOptions);

    const rawRefresh = randomBytes(48).toString('hex');
    const ttlDays = this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');
    const expiresAt = new Date(Date.now() + ttlDays * 86400 * 1000);

    await runner.getRepository(RefreshToken).save({
      userId: user.id,
      tokenHash: this.hashToken(rawRefresh),
      expiresAt,
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: this.accessTtlSeconds(),
    };
  }

  /**
   * Rotate: validate the presented refresh token, revoke it, and issue a new
   * pair. A reused/invalid/expired token is rejected uniformly.
   */
  async rotate(rawRefresh: string): Promise<TokenPairDto> {
    return this.dataSource.transaction(async (manager) => {
      const tokenHash = this.hashToken(rawRefresh);
      const stored = await manager.getRepository(RefreshToken).findOne({
        where: { tokenHash },
      });

      if (
        !stored ||
        stored.revokedAt !== null ||
        stored.expiresAt.getTime() <= Date.now()
      ) {
        throw new BusinessException(
          ErrorCode.INVALID_REFRESH_TOKEN,
          'Refresh token is invalid or expired',
          HttpStatus.UNAUTHORIZED,
        );
      }

      stored.revokedAt = new Date();
      await manager.getRepository(RefreshToken).save(stored);

      const user = await manager.getRepository(User).findOne({
        where: { id: stored.userId },
      });
      if (!user || !user.isActive) {
        throw new BusinessException(
          ErrorCode.INVALID_REFRESH_TOKEN,
          'Refresh token is invalid or expired',
          HttpStatus.UNAUTHORIZED,
        );
      }

      return this.issuePair(user, manager);
    });
  }

  /** Revoke a single refresh token (logout). Silent if already gone. */
  async revoke(rawRefresh: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefresh);
    await this.dataSource
      .getRepository(RefreshToken)
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('token_hash = :tokenHash AND revoked_at IS NULL', { tokenHash })
      .execute();
  }

  /** Revoke every active refresh token for a user (e.g. after password change). */
  async revokeAllForUser(
    userId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const runner = manager ?? this.dataSource.manager;
    await runner
      .getRepository(RefreshToken)
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId AND revoked_at IS NULL', { userId })
      .execute();
  }
}
