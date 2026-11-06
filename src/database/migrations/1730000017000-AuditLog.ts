import { MigrationInterface, QueryRunner } from 'typeorm';

/** Business tables to audit, with columns whose values must never be logged. */
const AUDITED_TABLES: ReadonlyArray<readonly [string, ...string[]]> = [
  ['shops'],
  ['users', 'password_hash'],
  ['phones'],
  ['accessories'],
  ['accessory_stock_entries'],
  ['stock_receipts'],
  ['sales'],
  ['sale_items'],
  ['sale_returns'],
  ['debts'],
  ['debt_payments'],
  ['expenses'],
  ['creditors'],
  ['debt_book_entries'],
];

/**
 * Append-only change history, written by row triggers so every path that
 * changes data is covered, including manual SQL. `shop_id` and `actor_id` have
 * no foreign keys: history must outlive the shop or user it refers to.
 *
 * UPDATE rows hold only the changed columns. An `updated_at`-only change or a
 * no-op save is not logged. Idempotent.
 */
export class AuditLog1730000017000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_log" (
        "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        "shop_id" uuid,
        "table_name" text NOT NULL,
        "row_id" uuid NOT NULL,
        "action" text NOT NULL,
        "old_data" jsonb,
        "new_data" jsonb,
        "actor_id" uuid,
        "request_id" text,
        "transaction_id" bigint NOT NULL DEFAULT txid_current(),
        "db_user" text NOT NULL DEFAULT session_user
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_log_shop_occurred_at" ON "audit_log" ("shop_id", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_log_row" ON "audit_log" ("table_name", "row_id", "occurred_at")`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        full_row jsonb;
        old_data jsonb;
        new_data jsonb;
      BEGIN
        IF TG_OP = 'INSERT' THEN
          full_row := to_jsonb(NEW);
          new_data := full_row;
        ELSIF TG_OP = 'DELETE' THEN
          full_row := to_jsonb(OLD);
          old_data := full_row;
        ELSE
          full_row := to_jsonb(NEW);
          SELECT jsonb_object_agg(o.key, o.value), jsonb_object_agg(n.key, n.value)
            INTO old_data, new_data
            FROM jsonb_each(to_jsonb(OLD)) o
            JOIN jsonb_each(full_row) n ON n.key = o.key
           WHERE o.value IS DISTINCT FROM n.value
             AND o.key <> 'updated_at';
          IF new_data IS NULL THEN
            RETURN NULL;
          END IF;
        END IF;

        -- Trigger arguments name secret columns: record that they changed, not their value.
        FOR i IN 0 .. TG_NARGS - 1 LOOP
          IF old_data ? TG_ARGV[i] THEN
            old_data := jsonb_set(old_data, ARRAY[TG_ARGV[i]], '"[hidden]"');
          END IF;
          IF new_data ? TG_ARGV[i] THEN
            new_data := jsonb_set(new_data, ARRAY[TG_ARGV[i]], '"[hidden]"');
          END IF;
        END LOOP;

        INSERT INTO audit_log
          (shop_id, table_name, row_id, action, old_data, new_data, actor_id, request_id)
        VALUES (
          COALESCE(full_row->>'shop_id', CASE WHEN TG_TABLE_NAME = 'shops' THEN full_row->>'id' END)::uuid,
          TG_TABLE_NAME,
          (full_row->>'id')::uuid,
          TG_OP,
          old_data,
          new_data,
          NULLIF(current_setting('audit.actor_id', true), '')::uuid,
          NULLIF(current_setting('audit.request_id', true), '')
        );
        RETURN NULL;
      END;
      $$
    `);

    for (const [table, ...secretColumns] of AUDITED_TABLES) {
      const args = secretColumns.map((c) => `'${c}'`).join(', ');
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS "audit_row_change" ON "${table}"`,
      );
      await queryRunner.query(`
        CREATE TRIGGER "audit_row_change"
        AFTER INSERT OR UPDATE OR DELETE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION audit_row_change(${args})
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table] of AUDITED_TABLES) {
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS "audit_row_change" ON "${table}"`,
      );
    }
    await queryRunner.query(`DROP FUNCTION IF EXISTS audit_row_change()`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_log"`);
  }
}
