import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Introduces partial debt payments. Each payment is recorded as a row in
 * `debt_payments`; a debt's `amount` column now tracks the *outstanding*
 * balance (reduced by every payment) and flips to PAID once it reaches zero.
 *
 * Backfill: any debt already marked PAID under the old "settle in one action"
 * model is given a single payment row for its full amount so that collected
 * totals in statistics stay accurate, then its outstanding amount is zeroed.
 */
export class DebtPayments1730000002000 implements MigrationInterface {
  name = 'DebtPayments1730000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "debt_payments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid NOT NULL,
        "debt_id" uuid NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "paid_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "note" text,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_debt_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_debt_payments_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_debt_payments_debt" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_debt_payments_user" FOREIGN KEY ("created_by") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_debt_payments_debt_id" ON "debt_payments" ("debt_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_debt_payments_shop_paid_at" ON "debt_payments" ("shop_id", "paid_at")`,
    );

    // Backfill existing fully-paid debts into the ledger.
    await queryRunner.query(`
      INSERT INTO "debt_payments" ("shop_id", "debt_id", "amount", "paid_at", "created_by")
      SELECT d."shop_id",
             d."id",
             d."amount",
             COALESCE(d."paid_at", d."created_at"),
             (SELECT u."id" FROM "users" u WHERE u."shop_id" = d."shop_id" LIMIT 1)
      FROM "debts" d
      WHERE d."status" = 'PAID'
        AND d."amount" > 0
        AND EXISTS (SELECT 1 FROM "users" u WHERE u."shop_id" = d."shop_id")
    `);

    // A settled debt has no outstanding balance left.
    await queryRunner.query(
      `UPDATE "debts" SET "amount" = 0 WHERE "status" = 'PAID'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the old model: outstanding amount of a paid debt was its full
    // sum, recoverable from the single backfilled payment row.
    await queryRunner.query(`
      UPDATE "debts" d
      SET "amount" = p."total"
      FROM (
        SELECT "debt_id", SUM("amount") AS "total"
        FROM "debt_payments"
        GROUP BY "debt_id"
      ) p
      WHERE p."debt_id" = d."id" AND d."status" = 'PAID'
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "debt_payments"`);
  }
}
