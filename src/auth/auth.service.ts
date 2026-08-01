import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { BusinessException, ErrorCode } from '../common';
import { Shop } from '../shop/entities/shop.entity';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenPairDto, MeResponseDto } from './dto/auth-response.dto';
import { User, UserRole } from './entities/user.entity';
import { TokensService } from './tokens.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tokens: TokensService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPairDto> {
    if (dto.password !== dto.confirmPassword) {
      throw BusinessException.badRequest(
        ErrorCode.PASSWORD_MISMATCH,
        'Password confirmation does not match',
      );
    }

    this.assertInviteCode(dto.inviteCode);

    const login = dto.login.toLowerCase();

    return this.dataSource.transaction(async (manager) => {
      const existing = await manager
        .getRepository(User)
        .findOne({ where: { login } });
      if (existing) {
        throw BusinessException.conflict(
          ErrorCode.LOGIN_ALREADY_TAKEN,
          'This login is already taken',
        );
      }

      const shop = await manager.getRepository(Shop).save({
        name: dto.shopName.trim(),
      });

      const passwordHash = await argon2.hash(dto.password);
      const user = await manager.getRepository(User).save({
        shopId: shop.id,
        fullName: dto.fullName.trim(),
        login,
        passwordHash,
        role: UserRole.OWNER,
        isActive: true,
      });

      return this.tokens.issuePair(user, manager);
    });
  }

  async login(dto: LoginDto): Promise<TokenPairDto> {
    const login = dto.login.toLowerCase();
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { login } });

    // Same error for unknown login and wrong password — no user enumeration.
    const invalid = () =>
      new BusinessException(
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid login or password',
        401,
      );

    if (!user || !user.isActive) {
      // Still spend time hashing to blunt timing analysis.
      await argon2.hash(dto.password).catch(() => undefined);
      throw invalid();
    }

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      throw invalid();
    }

    return this.tokens.issuePair(user);
  }

  async refresh(rawRefresh: string): Promise<TokenPairDto> {
    return this.tokens.rotate(rawRefresh);
  }

  async logout(rawRefresh: string): Promise<void> {
    await this.tokens.revoke(rawRefresh);
  }

  async me(userId: string, shopId: string): Promise<MeResponseDto> {
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: userId } });
    const shop = await this.dataSource
      .getRepository(Shop)
      .findOne({ where: { id: shopId } });

    if (!user || !shop) {
      throw BusinessException.notFound('Account not found');
    }

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        login: user.login,
        role: user.role,
        isActive: user.isActive,
      },
      shop: {
        id: shop.id,
        name: shop.name,
        address: shop.address,
        phone: shop.phone,
        labelFooter: shop.labelFooter,
      },
    };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<void> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw BusinessException.badRequest(
        ErrorCode.PASSWORD_MISMATCH,
        'Password confirmation does not match',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const user = await manager
        .getRepository(User)
        .findOne({ where: { id: userId } });
      if (!user) {
        throw BusinessException.notFound('Account not found');
      }

      const ok = await argon2.verify(user.passwordHash, dto.currentPassword);
      if (!ok) {
        throw BusinessException.badRequest(
          ErrorCode.CURRENT_PASSWORD_INVALID,
          'Current password is incorrect',
        );
      }

      user.passwordHash = await argon2.hash(dto.newPassword);
      await manager.getRepository(User).save(user);

      // Force re-login on all sessions after a password change.
      await this.tokens.revokeAllForUser(userId, manager);
    });
  }

  private assertInviteCode(provided?: string): void {
    const required = this.config.get<string>('INVITE_CODE') ?? '';
    if (!required) return; // open registration

    if (!provided) {
      throw BusinessException.badRequest(
        ErrorCode.INVITE_CODE_REQUIRED,
        'An invite code is required to register',
      );
    }
    if (provided !== required) {
      throw BusinessException.badRequest(
        ErrorCode.INVITE_CODE_INVALID,
        'The invite code is invalid',
      );
    }
  }
}
