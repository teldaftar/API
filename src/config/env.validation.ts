import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),

  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().default(30),

  INVITE_CODE: Joi.string().allow('').default(''),

  UPLOADS_DIR: Joi.string().default('./uploads'),

  // Comma-separated list of allowed frontend origins for CORS.
  CORS_ORIGINS: Joi.string().default('http://localhost:5173'),

  THROTTLE_TTL_MS: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(5),

  // Remote MCP endpoint. Stays off unless the URL, hash and password are all set.
  MCP_PUBLIC_URL: Joi.string().uri().allow(''),
  MCP_ADMIN_PASSWORD_HASH: Joi.string().allow(''),
  MCP_DB_USER: Joi.string().default('claude_ro'),
  MCP_DB_PASSWORD: Joi.string().allow(''),
});
