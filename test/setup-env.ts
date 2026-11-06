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
process.env.MCP_PUBLIC_URL = 'http://localhost/mcp';
// argon2 hash of `test-admin-password`.
process.env.MCP_ADMIN_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$v578c3QS5Gt2TpnPgOe7EA$yBthsEt4Ij5p9vZ0F29PvT9hGYMw908+dyDvEdt78+4';
process.env.MCP_DB_USER = 'claude_ro';
process.env.MCP_DB_PASSWORD = 'test-readonly-password';
