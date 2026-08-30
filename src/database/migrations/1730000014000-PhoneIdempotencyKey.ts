import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retry-safe phone intake. A client-supplied `idempotency_key` (one per
 * "add phone" intent) lets a duplicate submit — a double-click, or an
 * auto-retry after the response was lost on a flaky network — collapse to a
 * single row instead of creating two identical phones.
 *
 * The partial unique index enforces at-most-one phone per (shop, key); the
 * service catches the resulting conflict and returns the already-created row.
 * NULL keys are ignored (legacy/import paths that don't send one). Idempotent.
 */
export class PhoneIdempotencyKey1730000014000 implements MigrationInterface {
  name = 'PhoneIdempotencyKey1730000014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "phones"
      ADD COLUMN IF NOT EXISTS "idempotency_key" uuid
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_phones_shop_idempotency"
      ON "phones" ("shop_id", "idempotency_key")
      WHERE "idempotency_key" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_phones_shop_idempotency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "phones" DROP COLUMN IF EXISTS "idempotency_key"`,
    );
  }
}