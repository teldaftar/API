import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1730000000000 implements MigrationInterface {
  name = 'InitialSchema1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Extensions -----------------------------------------------------------
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "citext"`);

    // --- Enums ---------------------------------------------------------------
    await queryRunner.query(`CREATE TYPE "users_role_enum" AS ENUM ('OWNER')`);
    await queryRunner.query(
      `CREATE TYPE "phones_condition_enum" AS ENUM ('NEW', 'USED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "phones_status_enum" AS ENUM ('IN_STOCK', 'SOLD')`,
    );
    await queryRunner.query(
      `CREATE TYPE "sales_type_enum" AS ENUM ('PHONE', 'ACCESSORY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "sales_status_enum" AS ENUM ('COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "sale_items_item_type_enum" AS ENUM ('PHONE', 'ACCESSORY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "debts_status_enum" AS ENUM ('OPEN', 'PAID', 'CANCELLED')`,
    );

    // --- shops ---------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "shops" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "name" varchar NOT NULL,
        "address" varchar,
        "phone" varchar,
        "label_footer" varchar,
        CONSTRAINT "PK_shops" PRIMARY KEY ("id")
      )
    `);

    // --- users ---------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "shop_id" uuid NOT NULL,
        "full_name" varchar NOT NULL,
        "login" citext NOT NULL,
        "password_hash" varchar NOT NULL,
        "role" "users_role_enum" NOT NULL DEFAULT 'OWNER',
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_login" UNIQUE ("login"),
        CONSTRAINT "FK_users_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_users_shop_id" ON "users" ("shop_id")`,
    );

    // --- refresh_tokens ------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token_hash" varchar NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "revoked_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")`,
    );

    // --- phones --------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "phones" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "shop_id" uuid NOT NULL,
        "name" varchar NOT NULL,
        "imei" varchar(20) NOT NULL,
        "purchase_price" numeric(14,2) NOT NULL,
        "list_price" numeric(14,2),
        "condition" "phones_condition_enum",
        "ram_gb" integer,
        "storage_gb" integer,
        "image_url" varchar,
        "note" text,
        "status" "phones_status_enum" NOT NULL DEFAULT 'IN_STOCK',
        CONSTRAINT "PK_phones" PRIMARY KEY ("id"),
        CONSTRAINT "FK_phones_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_phones_shop_id" ON "phones" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_phones_shop_status_created" ON "phones" ("shop_id", "status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_phones_shop_imei" ON "phones" ("shop_id", "imei")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_phones_name_lower" ON "phones" (LOWER("name"))`,
    );
    // Only one IN_STOCK phone per IMEI per shop; sold/deleted duplicates allowed.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_phones_shop_imei_instock"
      ON "phones" ("shop_id", "imei")
      WHERE "deleted_at" IS NULL AND "status" = 'IN_STOCK'
    `);

    // --- accessories ---------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "accessories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "shop_id" uuid NOT NULL,
        "name" varchar NOT NULL,
        "purchase_price" numeric(14,2) NOT NULL,
        "sale_price" numeric(14,2),
        "quantity" integer NOT NULL DEFAULT 0,
        "image_url" varchar,
        "note" text,
        CONSTRAINT "PK_accessories" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_accessories_qty" CHECK ("quantity" >= 0),
        CONSTRAINT "FK_accessories_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_accessories_shop_id" ON "accessories" ("shop_id")`,
    );

    // --- accessory_stock_entries ---------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "accessory_stock_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid NOT NULL,
        "accessory_id" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "purchase_price" numeric(14,2) NOT NULL,
        "note" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_accessory_stock_entries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ase_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ase_accessory" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_accessory_stock_entries_shop_id" ON "accessory_stock_entries" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_accessory_stock_entries_accessory_created" ON "accessory_stock_entries" ("accessory_id", "created_at")`,
    );

    // --- sale_counters -------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "sale_counters" (
        "shop_id" uuid NOT NULL,
        "last_value" bigint NOT NULL DEFAULT 0,
        CONSTRAINT "PK_sale_counters" PRIMARY KEY ("shop_id"),
        CONSTRAINT "FK_sale_counters_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE
      )
    `);

    // --- sales ---------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "sales" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid NOT NULL,
        "code" varchar NOT NULL,
        "type" "sales_type_enum" NOT NULL,
        "total_amount" numeric(14,2) NOT NULL,
        "paid_amount" numeric(14,2) NOT NULL,
        "debt_amount" numeric(14,2) NOT NULL,
        "status" "sales_status_enum" NOT NULL DEFAULT 'COMPLETED',
        "note" text,
        "sold_by" uuid NOT NULL,
        "sold_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sales" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sales_shop_code" UNIQUE ("shop_id", "code"),
        CONSTRAINT "FK_sales_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sales_user" FOREIGN KEY ("sold_by") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_sales_shop_id" ON "sales" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sales_shop_sold_at" ON "sales" ("shop_id", "sold_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sales_shop_type_sold_at" ON "sales" ("shop_id", "type", "sold_at")`,
    );

    // --- sale_items ----------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "sale_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid NOT NULL,
        "sale_id" uuid NOT NULL,
        "item_type" "sale_items_item_type_enum" NOT NULL,
        "phone_id" uuid,
        "accessory_id" uuid,
        "quantity" integer NOT NULL,
        "unit_price" numeric(14,2) NOT NULL,
        "cost_price" numeric(14,2) NOT NULL,
        "line_total" numeric(14,2) NOT NULL,
        "returned_quantity" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_sale_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sale_items_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sale_items_sale" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sale_items_phone" FOREIGN KEY ("phone_id") REFERENCES "phones"("id"),
        CONSTRAINT "FK_sale_items_accessory" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id"),
        CONSTRAINT "CHK_sale_items_one_ref" CHECK (
          ("item_type" = 'PHONE' AND "phone_id" IS NOT NULL AND "accessory_id" IS NULL)
          OR
          ("item_type" = 'ACCESSORY' AND "accessory_id" IS NOT NULL AND "phone_id" IS NULL)
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_sale_items_sale_id" ON "sale_items" ("sale_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sale_items_shop_id" ON "sale_items" ("shop_id")`,
    );

    // --- sale_returns --------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "sale_returns" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid NOT NULL,
        "sale_id" uuid NOT NULL,
        "sale_item_id" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "reason" text NOT NULL,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sale_returns" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sale_returns_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sale_returns_sale" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sale_returns_item" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sale_returns_user" FOREIGN KEY ("created_by") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_sale_returns_shop_id" ON "sale_returns" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sale_returns_sale_id" ON "sale_returns" ("sale_id")`,
    );

    // --- debts ---------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "debts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid NOT NULL,
        "sale_id" uuid NOT NULL,
        "customer_name" varchar NOT NULL,
        "customer_phone" varchar NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "due_date" date NOT NULL,
        "status" "debts_status_enum" NOT NULL DEFAULT 'OPEN',
        "paid_at" TIMESTAMPTZ,
        "note" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_debts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_debts_sale_id" UNIQUE ("sale_id"),
        CONSTRAINT "FK_debts_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_debts_sale" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_debts_shop_id" ON "debts" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_debts_shop_status_due" ON "debts" ("shop_id", "status", "due_date")`,
    );

    // --- expenses ------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "expenses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "shop_id" uuid NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "note" text NOT NULL,
        "spent_at" date NOT NULL,
        "created_by" uuid NOT NULL,
        CONSTRAINT "PK_expenses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_expenses_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_expenses_user" FOREIGN KEY ("created_by") REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_expenses_shop_spent_at" ON "expenses" ("shop_id", "spent_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "expenses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "debts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_returns"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sales"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_counters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "accessory_stock_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "accessories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "phones"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shops"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "debts_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "sale_items_item_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "sales_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "sales_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "phones_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "phones_condition_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }
}
