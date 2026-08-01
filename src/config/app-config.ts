import { ConfigService } from '@nestjs/config';

/**
 * Shop-local timezone. All date-range filters are interpreted in this zone
 * and converted to UTC boundaries in queries.
 */
export const APP_TIMEZONE = 'Asia/Tashkent';

export type AppConfig = ReturnType<typeof appConfig>;

export const appConfig = (config: ConfigService) => ({
  nodeEnv: config.getOrThrow<string>('NODE_ENV'),
  port: config.getOrThrow<number>('PORT'),
  db: {
    host: config.getOrThrow<string>('DB_HOST'),
    port: config.getOrThrow<number>('DB_PORT'),
    user: config.getOrThrow<string>('DB_USER'),
    password: config.getOrThrow<string>('DB_PASSWORD'),
    name: config.getOrThrow<string>('DB_NAME'),
  },
  jwt: {
    accessSecret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    accessTtl: config.getOrThrow<string>('JWT_ACCESS_TTL'),
    refreshTtlDays: config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS'),
  },
  inviteCode: config.get<string>('INVITE_CODE') ?? '',
  uploadsDir: config.getOrThrow<string>('UPLOADS_DIR'),
  throttle: {
    ttlMs: config.getOrThrow<number>('THROTTLE_TTL_MS'),
    limit: config.getOrThrow<number>('THROTTLE_LIMIT'),
  },
});
