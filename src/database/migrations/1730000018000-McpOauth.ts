import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * OAuth state for the remote MCP endpoint. Codes and tokens are stored only as
 * SHA-256 hashes. Not tenant data: the MCP endpoint has a single admin.
 * `scripts/claude-readonly-role.sql` keeps these tables closed to `claude_ro`.
 * Idempotent.
 */
export class McpOauth1730000018000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mcp_oauth_clients" (
        "client_id" text PRIMARY KEY,
        "metadata" jsonb NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mcp_oauth_codes" (
        "code_hash" text PRIMARY KEY,
        "client_id" text NOT NULL REFERENCES "mcp_oauth_clients"("client_id") ON DELETE CASCADE,
        "redirect_uri" text NOT NULL,
        "code_challenge" text NOT NULL,
        "scopes" text[] NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mcp_oauth_tokens" (
        "token_hash" text PRIMARY KEY,
        "kind" text NOT NULL CHECK ("kind" IN ('access', 'refresh')),
        "client_id" text NOT NULL REFERENCES "mcp_oauth_clients"("client_id") ON DELETE CASCADE,
        "scopes" text[] NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_mcp_oauth_tokens_client_id" ON "mcp_oauth_tokens" ("client_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mcp_oauth_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mcp_oauth_codes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mcp_oauth_clients"`);
  }
}
