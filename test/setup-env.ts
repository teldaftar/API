/**
 * Force the test database + deterministic secrets BEFORE any app module loads.
 * These override anything in `.env` because process.env wins over dotenv.
 */
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.TEST_DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.TEST_DB_PORT ?? '5433';
process.env.DB_USER = process.env.TEST_DB_USER ?? 'nematoff';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD ?? '';
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'shop_test';
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.REFRESH_TOKEN_TTL_DAYS = '30';
process.env.INVITE_CODE = '';
process.env.UPLOADS_DIR = './uploads';
process.env.THROTTLE_TTL_MS = '60000';
process.env.THROTTLE_LIMIT = '1000';
