import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A single sale can now bundle phones AND accessories, so `sales.type` gains a
 * MIXED value (all-phone → PHONE, all-accessory → ACCESSORY, both → MIXED).
 * Idempotent via ADD VALUE IF NOT EXISTS.
 */
export class MixedSaleType1730000010000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "sales_type_enum" ADD VALUE IF NOT EXISTS 'MIXED'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres can't drop a single enum value without recreating the type and
    // rewriting every dependent column; leaving the extra value is harmless.
  }
}
