import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Grouped accessory intake ("prixod / kirim"): a receipt header + line items,
 * plus a per-shop code counter. Also links existing intake log rows
 * (accessory_stock_entries) back to the receipt they came in on.
 */
export class StockReceipts1730000008000 implements MigrationInterface {
  name = 'StockReceipts1730000008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- stock_receipts ------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_receipts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid NOT NULL,
        "code" varchar NOT NULL,
        "supplier_name" varchar,
        "supplier_phone" varchar,
        "total_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "total_qty" int NOT NULL DEFAULT 0,
        "item_count" int NOT NULL DEFAULT 0,
        "note" text,
        "received_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" uuid NOT NULL,
        CONSTRAINT "PK_stock_receipts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stock_receipts_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_receipts_user" FOREIGN KEY ("created_by") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_stock_receipts_shop_received" ON "stock_receipts" ("shop_id", "received_at")`,
    );

    // --- stock_receipt_items -------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_receipt_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid NOT NULL,
        "receipt_id" uuid NOT NULL,
        "accessory_id" uuid NOT NULL,
        "quantity" int NOT NULL,
        "purchase_price" numeric(14,2) NOT NULL,
        "line_total" numeric(14,2) NOT NULL,
        CONSTRAINT "PK_stock_receipt_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sri_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sri_receipt" FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sri_accessory" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_stock_receipt_items_receipt_id" ON "stock_receipt_items" ("receipt_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_stock_receipt_items_accessory_id" ON "stock_receipt_items" ("accessory_id")`,
    );

    // --- stock_receipt_counters ----------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_receipt_counters" (
        "shop_id" uuid NOT NULL,
        "last_value" bigint NOT NULL DEFAULT 0,
        CONSTRAINT "PK_stock_receipt_counters" PRIMARY KEY ("shop_id"),
        CONSTRAINT "FK_stock_receipt_counters_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE
      )
    `);

    // --- accessory_stock_entries.receipt_id ----------------------------------
    await queryRunner.query(
      `ALTER TABLE "accessory_stock_entries" ADD COLUMN IF NOT EXISTS "receipt_id" uuid`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_ase_receipt'
        ) THEN
          ALTER TABLE "accessory_stock_entries"
            ADD CONSTRAINT "FK_ase_receipt"
            FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accessory_stock_entries" DROP CONSTRAINT IF EXISTS "FK_ase_receipt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accessory_stock_entries" DROP COLUMN IF EXISTS "receipt_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_receipt_counters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_receipt_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_receipts"`);
  }
}
