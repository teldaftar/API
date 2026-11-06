import { Client } from 'pg';
import type { McpConfig } from './mcp-config';

const STATEMENT_TIMEOUT_MS = 15_000;
const CONNECT_TIMEOUT_MS = 5_000;
export const DEFAULT_ROW_LIMIT = 200;
export const MAX_ROW_LIMIT = 1000;
const MAX_RESULT_BYTES = 256 * 1024;

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
}

/**
 * Read-only access as the `claude_ro` role. Its grants are the real boundary;
 * the rest keeps one query from doing more than one thing:
 *  - a named statement goes through the extended protocol, so `select 1; commit`
 *    is refused instead of ending the read-only transaction;
 *  - DECLARE CURSOR accepts only SELECT/VALUES and lets rows be capped without
 *    rewriting the query.
 *
 * Each call opens its own connection, so named statements never pile up.
 */
export class McpDb {
  constructor(private readonly config: McpConfig['db']) {}

  private async withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({
      ...this.config,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      // Exact text from Postgres: money stays precise, times keep their +05.
      types: { getTypeParser: () => (value: string) => value },
    } as ConstructorParameters<typeof Client>[0]);
    await client.connect();
    try {
      await client.query('BEGIN READ ONLY');
      return await run(client);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  query(sql: string, limit: number): Promise<QueryResult> {
    return this.withClient(async (client) => {
      await client.query({
        name: 'mcp_declare',
        text: `DECLARE mcp_cursor NO SCROLL CURSOR FOR ${sql}`,
      });
      const fetched = await client.query({
        text: `FETCH FORWARD ${limit + 1} FROM mcp_cursor`,
        rowMode: 'array',
      });
      const columns = fetched.fields.map((field) => field.name);
      const rows = fetched.rows as unknown[][];
      let truncated = rows.length > limit;
      if (truncated) rows.length = limit;
      while (rows.length && JSON.stringify(rows).length > MAX_RESULT_BYTES) {
        rows.length = Math.floor(rows.length / 2);
        truncated = true;
      }
      return { columns, rows, truncated };
    });
  }

  // Privilege checks take OIDs, not names: Postgres may evaluate them before the
  // schema filter, and a name built from another schema's table would raise.
  listTables(): Promise<Array<{ table: string }>> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(`
        SELECT c.relname AS "table"
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind IN ('r', 'p', 'v', 'm')
           AND has_any_column_privilege(c.oid, 'SELECT')
         ORDER BY 1`);
      return rows as Array<{ table: string }>;
    });
  }

  describeTable(table: string): Promise<unknown[]> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT a.attname AS "column",
                format_type(a.atttypid, a.atttypmod) AS "type",
                NOT a.attnotnull AS "nullable"
           FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = $1
            AND a.attnum > 0 AND NOT a.attisdropped
            AND has_column_privilege(c.oid, a.attnum, 'SELECT')
          ORDER BY a.attnum`,
        [table],
      );
      return rows;
    });
  }
}
