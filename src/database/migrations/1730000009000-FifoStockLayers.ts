import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FIFO costing for accessories. Each stock entry becomes a cost *layer* with a
 * `remaining_quantity`; sales consume the oldest layers first and snapshot the
 * blended cost. Returns re-enter stock as their own layer (`sale_return_id`
 * set) so they're excluded from "purchased" stats. Receipt lines are now read
 * straight from the layers (`accessory_stock_entries.receipt_id`), so the
 * redundant `stock_receipt_items` table is dropped.
 */
export class FifoStockLayers1730000009000 implements MigrationInterface {
  name = 'FifoStockLayers1730000009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- remaining_quantity (with a FIFO backfill of existing data) ----------
    await queryRunner.query(
      `ALTER TABLE "accessory_stock_entries" ADD COLUMN IF NOT EXISTS "remaining_quantity" int`,
    );
    // Reconstruct remaining stock: under FIFO the units still on hand are the
    // most recently received ones, so fill newest layers first up to the
    // accessory's current denormalized quantity.
    await queryRunner.query(`
      DO $$
      DECLARE a RECORD; e RECORD; pool int; give int;
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'accessory_stock_entries'
            AND column_name = 'remaining_quantity'
            AND is_nullable = 'YES'
        ) THEN
          FOR a IN SELECT id, quantity FROM accessories LOOP
            pool := COALESCE(a.quantity, 0);
            FOR e IN
              SELECT id, quantity FROM accessory_stock_entries
              WHERE accessory_id = a.id
              ORDER BY created_at DESC, id DESC
            LOOP
              give := LEAST(e.quantity, pool);
              UPDATE accessory_stock_entries SET remaining_quantity = give WHERE id = e.id;
              pool := pool - give;
            END LOOP;
          END LOOP;
          UPDATE accessory_stock_entries SET remaining_quantity = 0 WHERE remaining_quantity IS NULL;
          ALTER TABLE "accessory_stock_entries" ALTER COLUMN "remaining_quantity" SET NOT NULL;
        END IF;
      END $$;
    `);

    // --- sale_return_id (a layer created by a return, not a purchase) --------
    await queryRunner.query(
      `ALTER TABLE "accessory_stock_entries" ADD COLUMN IF NOT EXISTS "sale_return_id" uuid`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_ase_sale_return'
        ) THEN
          ALTER TABLE "accessory_stock_entries"
            ADD CONSTRAINT "FK_ase_sale_return"
            FOREIGN KEY ("sale_return_id") REFERENCES "sale_returns"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // --- drop the now-redundant receipt line table ---------------------------
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_receipt_items"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate stock_receipt_items (schema from the StockReceipts migration).
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
      `ALTER TABLE "accessory_stock_entries" DROP CONSTRAINT IF EXISTS "FK_ase_sale_return"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accessory_stock_entries" DROP COLUMN IF EXISTS "sale_return_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accessory_stock_entries" DROP COLUMN IF EXISTS "remaining_quantity"`,
    );
  }
}
