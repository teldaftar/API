import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional buyer contact (name / phone) on every sale — not just debt sales —
 * so the shop can follow up with any customer.
 */
export class SaleCustomer1730000004000 implements MigrationInterface {
  name = 'SaleCustomer1730000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sales" ADD COLUMN "customer_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales" ADD COLUMN "customer_phone" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN "customer_phone"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN "customer_name"`);
  }
}
