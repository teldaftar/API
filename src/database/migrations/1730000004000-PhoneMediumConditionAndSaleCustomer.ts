import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a 'MEDIUM' phone condition (between NEW and USED) and optional buyer
 * contact (name / phone) on every sale — not just debt sales — so the shop can
 * follow up with any customer.
 */
export class PhoneMediumConditionAndSaleCustomer1730000004000
  implements MigrationInterface
{
  name = 'PhoneMediumConditionAndSaleCustomer1730000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "phones_condition_enum" ADD VALUE IF NOT EXISTS 'MEDIUM' BEFORE 'USED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales" ADD COLUMN "customer_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales" ADD COLUMN "customer_phone" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sales" DROP COLUMN "customer_phone"`,
    );
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN "customer_name"`);
    // Postgres cannot drop a single enum value; the 'MEDIUM' label is left in
    // place on rollback (harmless — no rows reference it after down of sales).
  }
}
