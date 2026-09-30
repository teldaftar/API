import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Qarz daftari — manual ledger of money people owe the shop, independent of
 * sales. Flat table modelled on `creditors`: borrower + amount + optional
 * phone/due date/note. Soft-deletable. Idempotent.
 */
export class DebtBook1730000016000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "debt_book_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "shop_id" uuid NOT NULL,
        "borrower_name" text NOT NULL,
        "phone" character varying(30),
        "amount" numeric(14,2) NOT NULL,
        "due_date" date,
        "note" text,
        "created_by" uuid NOT NULL,
        CONSTRAINT "PK_debt_book_entries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_debt_book_entries_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_debt_book_entries_user" FOREIGN KEY ("created_by") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_debt_book_entries_shop_created_at" ON "debt_book_entries" ("shop_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "debt_book_entries"`);
  }
}
