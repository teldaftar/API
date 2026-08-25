import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional IMEI on accessories — only meaningful for KEYPAD_PHONE items (a
 * single physical phone). Nullable varchar, not unique (a keypad row may carry
 * a quantity and blank/duplicate IMEIs are tolerated). Idempotent.
 */
export class AccessoryImei1730000012000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accessories"
      ADD COLUMN IF NOT EXISTS "imei" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accessories" DROP COLUMN IF EXISTS "imei"`,
    );
  }
}
