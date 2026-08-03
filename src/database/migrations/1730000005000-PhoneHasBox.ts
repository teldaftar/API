import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds an optional `has_box` flag to phones — whether the device still has its
 * original box. Kept separate from `condition` so the two dimensions (quality
 * vs packaging) don't get tangled into one list.
 */
export class PhoneHasBox1730000005000 implements MigrationInterface {
  name = 'PhoneHasBox1730000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "phones" ADD COLUMN "has_box" boolean`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "phones" DROP COLUMN "has_box"`);
  }
}
