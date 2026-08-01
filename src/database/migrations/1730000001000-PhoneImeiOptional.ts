import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * IMEI becomes optional on phones. The partial unique index is recreated to
 * also require `imei IS NOT NULL` — Postgres already treats NULLs as distinct,
 * but making it explicit keeps intent clear.
 */
export class PhoneImeiOptional1730000001000 implements MigrationInterface {
  name = 'PhoneImeiOptional1730000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "phones" ALTER COLUMN "imei" DROP NOT NULL`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_phones_shop_imei_instock"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_phones_shop_imei_instock"
      ON "phones" ("shop_id", "imei")
      WHERE "deleted_at" IS NULL AND "status" = 'IN_STOCK' AND "imei" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_phones_shop_imei_instock"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_phones_shop_imei_instock"
      ON "phones" ("shop_id", "imei")
      WHERE "deleted_at" IS NULL AND "status" = 'IN_STOCK'
    `);
    await queryRunner.query(
      `ALTER TABLE "phones" ALTER COLUMN "imei" SET NOT NULL`,
    );
  }
}
