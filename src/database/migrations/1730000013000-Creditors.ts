import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Haqdorlar — creditors (money the shop owes to a person). Flat table modelled
 * on `expenses`: amount + who + optional phone/note + borrowed/due dates.
 * Soft-deletable. Idempotent.
 */
export class Creditors1730000013000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creditors" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "shop_id" uuid NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "creditor_name" text NOT NULL,
        "phone" character varying(30),
        "note" text,
        "borrowed_at" date NOT NULL,
        "due_date" date NOT NULL,
        "created_by" uuid NOT NULL,
        CONSTRAINT "PK_creditors" PRIMARY KEY ("id"),
        CONSTRAINT "FK_creditors_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_creditors_user" FOREIGN KEY ("created_by") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_creditors_shop_borrowed_at" ON "creditors" ("shop_id", "borrowed_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "creditors"`);
  }
}
