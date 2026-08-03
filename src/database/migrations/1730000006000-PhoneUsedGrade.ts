import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds an optional wear grade (GOOD / MEDIUM / BAD) for phones. It only applies
 * to USED phones — the service nulls it for NEW ones — so the quality gradient
 * stays separate from the NEW/USED condition and from the box flag.
 */
export class PhoneUsedGrade1730000006000 implements MigrationInterface {
  name = 'PhoneUsedGrade1730000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotent guards so a partial/renamed migration history can't collide.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'phones_used_grade_enum'
        ) THEN
          CREATE TYPE "phones_used_grade_enum" AS ENUM ('GOOD', 'MEDIUM', 'BAD');
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "phones" ADD COLUMN IF NOT EXISTS "used_grade" "phones_used_grade_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "phones" DROP COLUMN "used_grade"`);
    await queryRunner.query(`DROP TYPE "phones_used_grade_enum"`);
  }
}
