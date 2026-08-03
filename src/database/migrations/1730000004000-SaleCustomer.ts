import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional buyer contact (name / phone) on every sale — not just debt sales —
 * so the shop can follow up with any customer.
 */
export class SaleCustomer1730000004000 implements MigrationInterface {
  name = 'SaleCustomer1730000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // IF NOT EXISTS: an earlier build shipped these columns under a different
    // migration name, so they may already be present on some databases.
    await queryRunner.query(
      `ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "customer_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "customer_phone" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN "customer_phone"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN "customer_name"`);
  }
}
