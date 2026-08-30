import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retry-safe sale creation. Like phones, a flaky-network retry or a
 * double-click could post the same sale twice — consuming accessory stock
 * twice and issuing two sale codes. A client-supplied `idempotency_key` (one
 * per "checkout" intent) collapses the repeat to a single sale via the partial
 * unique index; the service returns the first sale on the duplicate.
 *
 * (Phone-only sales already self-guard via PHONE_ALREADY_SOLD, but
 * accessory-only sales had no such protection.) NULL keys ignored. Idempotent.
 */
export class SaleIdempotencyKey1730000015000 implements MigrationInterface {
  name = 'SaleIdempotencyKey1730000015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN IF NOT EXISTS "idempotency_key" uuid
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_sales_shop_idempotency"
      ON "sales" ("shop_id", "idempotency_key")
      WHERE "idempotency_key" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_sales_shop_idempotency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales" DROP COLUMN IF EXISTS "idempotency_key"`,
    );
  }
}
