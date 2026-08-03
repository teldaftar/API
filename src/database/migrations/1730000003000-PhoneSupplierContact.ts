import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds supplier contact fields (name / surname / phone) to phones so the shop
 * can reach back out to whoever they bought a phone from, and removes the
 * 20-char cap on IMEI (dual-IMEI devices need more room).
 */
export class PhoneSupplierContact1730000003000 implements MigrationInterface {
  name = 'PhoneSupplierContact1730000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "phones" ALTER COLUMN "imei" TYPE character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "phones" ADD COLUMN "supplier_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "phones" ADD COLUMN "supplier_surname" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "phones" ADD COLUMN "supplier_phone" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "phones" DROP COLUMN "supplier_phone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "phones" DROP COLUMN "supplier_surname"`,
    );
    await queryRunner.query(`ALTER TABLE "phones" DROP COLUMN "supplier_name"`);
    await queryRunner.query(
      `ALTER TABLE "phones" ALTER COLUMN "imei" TYPE character varying(20)`,
    );
  }
}
