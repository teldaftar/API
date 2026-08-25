import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Keypad ("button") phones reuse the accessory quantity + cost-layer model, so
 * they live in the `accessories` table behind a `kind` discriminator
 * (ACCESSORY | KEYPAD_PHONE). Selling one produces a KEYPAD_PHONE sale line /
 * sale type, kept distinct from accessories for reporting.
 *
 * Idempotent: enum creation is guarded, `ADD VALUE IF NOT EXISTS` is a no-op on
 * re-run, and the column/index use IF NOT EXISTS. The rewritten sale_items
 * CHECK never references the new enum value (only the pre-existing 'PHONE'), so
 * it is safe to add the value and recreate the constraint in one transaction.
 */
export class KeypadPhones1730000011000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // accessories.kind — the ACCESSORY vs KEYPAD_PHONE discriminator.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'accessories_kind_enum') THEN
          CREATE TYPE "accessories_kind_enum" AS ENUM ('ACCESSORY', 'KEYPAD_PHONE');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "accessories"
      ADD COLUMN IF NOT EXISTS "kind" "accessories_kind_enum"
      NOT NULL DEFAULT 'ACCESSORY'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_accessories_shop_kind"
      ON "accessories" ("shop_id", "kind")
    `);

    // New sale-line and sale types for keypad phones.
    await queryRunner.query(
      `ALTER TYPE "sale_items_item_type_enum" ADD VALUE IF NOT EXISTS 'KEYPAD_PHONE'`,
    );
    await queryRunner.query(
      `ALTER TYPE "sales_type_enum" ADD VALUE IF NOT EXISTS 'KEYPAD_PHONE'`,
    );

    // Widen the one-ref CHECK so any non-PHONE line (ACCESSORY or KEYPAD_PHONE)
    // carries accessory_id. Phrased against 'PHONE' only so it never touches the
    // freshly-added enum value.
    await queryRunner.query(
      `ALTER TABLE "sale_items" DROP CONSTRAINT IF EXISTS "CHK_sale_items_one_ref"`,
    );
    await queryRunner.query(`
      ALTER TABLE "sale_items" ADD CONSTRAINT "CHK_sale_items_one_ref" CHECK (
        ("item_type" = 'PHONE' AND "phone_id" IS NOT NULL AND "accessory_id" IS NULL)
        OR
        ("item_type" <> 'PHONE' AND "accessory_id" IS NOT NULL AND "phone_id" IS NULL)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the original ACCESSORY-only CHECK. Any KEYPAD_PHONE rows would
    // violate it, so callers must migrate them to ACCESSORY first.
    await queryRunner.query(
      `ALTER TABLE "sale_items" DROP CONSTRAINT IF EXISTS "CHK_sale_items_one_ref"`,
    );
    await queryRunner.query(`
      ALTER TABLE "sale_items" ADD CONSTRAINT "CHK_sale_items_one_ref" CHECK (
        ("item_type" = 'PHONE' AND "phone_id" IS NOT NULL AND "accessory_id" IS NULL)
        OR
        ("item_type" = 'ACCESSORY' AND "accessory_id" IS NOT NULL AND "phone_id" IS NULL)
      )
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_accessories_shop_kind"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accessories" DROP COLUMN IF EXISTS "kind"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "accessories_kind_enum"`);
    // Enum values on sale_items_item_type_enum / sales_type_enum are left in
    // place — Postgres can't drop a single value without recreating the type.
  }
}
