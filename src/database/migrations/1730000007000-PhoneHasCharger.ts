import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds an optional `has_charger` flag to phones — whether the device comes with
 * its charger. Kept separate from `condition` and `has_box`: packaging/accessory
 * presence is its own dimension, independent of new/used quality.
 */
export class PhoneHasCharger1730000007000 implements MigrationInterface {
  name = 'PhoneHasCharger1730000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "phones" ADD COLUMN IF NOT EXISTS "has_charger" boolean`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "phones" DROP COLUMN "has_charger"`);
  }
}
