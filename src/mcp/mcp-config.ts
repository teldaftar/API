export interface McpConfig {
  /** Canonical MCP URL, e.g. `https://api.teldaftar.uz/mcp`. */
  publicUrl: URL;
  adminPasswordHash: string;
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
}

interface ConfigReader {
  get<T>(key: string): T | undefined;
}

/** Returns null unless fully configured: the endpoint stays off by default. */
export function readMcpConfig(config: ConfigReader): McpConfig | null {
  const publicUrl = config.get<string>('MCP_PUBLIC_URL');
  const adminPasswordHash = config.get<string>('MCP_ADMIN_PASSWORD_HASH');
  const password = config.get<string>('MCP_DB_PASSWORD');
  if (!publicUrl || !adminPasswordHash || !password) return null;

  return {
    publicUrl: new URL(publicUrl),
    adminPasswordHash,
    db: {
      host: config.get<string>('DB_HOST') ?? 'localhost',
      port: Number(config.get<number>('DB_PORT') ?? 5432),
      database: config.get<string>('DB_NAME') ?? '',
      user: config.get<string>('MCP_DB_USER') ?? 'claude_ro',
      password,
    },
  };
}
