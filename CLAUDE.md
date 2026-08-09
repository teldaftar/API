# CLAUDE.md

Guidance for working in this repo. Read this instead of re-scanning the whole tree.

## What this is

**mini-werehouse** — backend for a phone & accessory shop (inventory + POS + debts + expenses + stats).
NestJS 11 · TypeORM 0.3 · PostgreSQL · JWT auth. REST API under `/api`, Swagger at `/api/docs`.
Frontend is a separate project (see `phone-shop-frontend-prompt.md`); the OpenAPI contract is exported to `openapi.json`.

## Commands

```bash
npm run start:dev          # watch mode
npm run build              # nest build -> dist/
npm run start:prod         # node dist/main
npm run migration:run      # apply migrations (data-source: src/database/data-source.ts)
npm run migration:generate -- src/database/migrations/<Name>   # generate from entity diff
npm run migration:revert
npm run openapi:export     # regenerate openapi.json
npm run lint / npm test / npm run test:e2e
```

DB schema is driven by **migrations only** — `synchronize` is off. After changing an entity, write/generate a migration. Migrations must be **idempotent** (see the `IF NOT EXISTS` style in existing ones).

## Core architecture

- **Multi-tenant by `shop_id`.** Every domain row carries `shop_id`. The current shop is read **only** from the verified JWT via the `@CurrentShop()` decorator (`src/common/decorators/current-shop.decorator.ts`) — never from body/params. This is the tenant-isolation backbone; every query filters by `shopId`.
- **Auth.** `register` creates a `Shop` + an `OWNER` `User` (gated by optional `INVITE_CODE`). Login uses argon2. Access JWT + rotating refresh tokens (`tokens.service.ts`). Only role today is `OWNER`.
- **Modules** (`src/<module>/`): `auth`, `shop`, `phones`, `accessories`, `stock-receipts`, `sales`, `debts`, `expenses`, `statistics`, `uploads`. Each = controller + service + entities + dto. Wired in `app.module.ts`.
- **Money** = Postgres `numeric(14,2)`, mapped to JS `number` via `numericTransformer` (`src/common/transformers`). Never do money math on the raw pg string.
- **Base entities** (`src/common/entities/base.entity.ts`): `UuidEntity` (uuid PK) → `TimestampedEntity` (createdAt/updatedAt) → `SoftDeletableEntity` (+ deletedAt). Phones/accessories/expenses are soft-deletable.
- **Timezone** is `Asia/Tashkent` (UTC+5), fixed. Date-range filters come in as `YYYY-MM-DD` local dates and are converted to UTC boundaries with `src/common/utils/tz.util.ts` (`localDateStartUtc`, `localDateEndExclusiveUtc`, etc.). Stats SQL shifts timestamps by `interval '5 hours'`.
- **Errors.** Throw `BusinessException.*` with an `ErrorCode` (`src/common/errors/`). `ErrorCode` values are a **public contract the frontend keys off — never rename an existing one**, only add. `AllExceptionsFilter` shapes the JSON response.
- **Validation.** Global `ValidationPipe` with `whitelist: true` + `forbidNonWhitelisted: true` — DTOs must declare every accepted field. `enableImplicitConversion: false`, so use `@Type(() => Number)` on numeric query/body fields.
- **Concurrency.** Stock/status/counter mutations run inside `dataSource.transaction` with `setLock('pessimistic_write')` on the affected row. Follow this pattern for anything that mutates stock or sequences.

## Domain model — the important bits

### Phones — unique-item model
Each phone is **one row** (`phones`), not a quantity. Fields: optional `imei`, `condition` NEW/USED, `usedGrade` GOOD/MEDIUM/BAD (only when USED), `hasBox`, `hasCharger`, `ramGb`/`storageGb`, supplier contact (`supplierName/surname/phone`), `purchasePrice`, `listPrice`, `status` IN_STOCK→SOLD. **Creating a phone IS its intake** — there is no separate stock-entry concept for phones.

### Accessories — quantity model with per-batch cost layers
`accessories` has a **denormalized `quantity`** and `purchasePrice`, both **derived** from the stock-entry layers — never hand-mutated. `quantity` = Σ `remaining_quantity` across layers; `purchasePrice` = the **oldest remaining layer's** cost (a display default — the actual sale cost is whichever batch the seller picks).
`accessory_stock_entries` is the **cost-layer ledger (batches)** — one row per intake (`quantity`, `remaining_quantity`, `purchasePrice`, `receipt_id?`, `sale_return_id?`, `createdAt`). `remaining_quantity` = units of that layer still on hand; `consumed = quantity − remaining_quantity`.
- **Costing = seller-chosen batch.** At sale time the seller **explicitly picks which batch** (`stockEntryId`) to sell from, so `sale_items.cost_price` = that batch's **exact** `purchasePrice` (no blending/auto-FIFO). A single line never spans batches — to draw from two batches, add two lines. See the costing memory.
- All intake/consume/recompute logic lives in **`AccessoriesService`**: `applyIntake` (new layer, remaining=qty), `consumeLayer` (decrement one chosen batch, returns its cost), `addReturnLayer` (returned goods re-enter as their own layer), `recalcAccessory` (re-derive `quantity` + `purchasePrice`). `lockAccessory` for the pessimistic lock. Never bump `quantity` by hand — mutate layers then `recalcAccessory`.
- Create accessory → opening layer via `applyIntake`. `POST /accessories/:id/stock` (`addStock`) → another layer. `GET /accessories/:id/stock` → layer history (each with `remainingQuantity`); `?available=true` → only batches with units left, oldest-first (the sale batch picker).
- "Sold" views (`/accessories/sold`, `/accessories/:id/sold`) aggregate from `sale_items` in raw SQL.

### Stock receipts — grouped accessory intake ("prixod / kirim")
`stock_receipts` (header only: `code` `P-000123`, optional supplier, denormalized `total_amount`/`total_qty`/`item_count`, `received_at`). Codes from `stock_receipt_counters` (per-shop, pessimistic lock, same pattern as sales). **There is no line table** — a receipt's lines ARE the FIFO layers it created: `accessory_stock_entries` rows tagged with its `receipt_id`. Each accessory appears **at most once per receipt**, so a line ↔ layer maps 1:1 by (`receipt_id`, `accessory_id`) (`RECEIPT_LINE_INVALID` on a duplicate accessory or a line without exactly one of `accessoryId`/`newAccessory`).
- `POST /stock-receipts`: one transaction. Each line restocks an existing accessory (`accessoryId`) or creates one inline (`newAccessory`), then `AccessoriesService.applyIntake()` writes the layer (tagged `receipt_id`).
- `GET /stock-receipts` (paginated, search by code/supplier, date range) and `GET /stock-receipts/:id` — lines read from the layers, each showing `remaining` (units of that layer still on hand).
- `PATCH /stock-receipts/:id`: reconciles layers against the new line set (matched by accessory). A layer's quantity can't drop below its `consumed` (→ `INSUFFICIENT_STOCK`, `details.minQuantity`); a removed line's layer must be untouched by sales; new lines create fresh layers (dated at `receivedAt` for stable FIFO order). Then `recalcAccessory` for every touched accessory.
- `DELETE /stock-receipts/:id`: allowed only if every layer is still fully remaining (nothing sold); else `INSUFFICIENT_STOCK`.
- **Stats:** purchased reads layers with `sale_return_id IS NULL` (excludes returned-goods layers); remaining value = Σ `remaining_quantity × purchase_price` over layers.
- Quantity + purchase cost of an accessory are owned by intake (receipts/addStock), not by `PATCH /accessories/:id` (which leaves `quantity` untouched; frontend stops sending `purchasePrice` there, though the DTO keeps it optional).

### Sales — one multi-item sale (phones + accessories mixed)
A single sale bundles **any mix** of phones and accessories. `sales` (header: `code` `S-000123`, `type` PHONE/ACCESSORY/**MIXED**, totals, `status`, optional customer, optional debt) + `sale_items` (line: `costPrice` is a **snapshot** of purchase price at sale time — never recomputed; `returnedQuantity` for partial returns). `type` is derived: all-phone→PHONE, all-accessory→ACCESSORY, both→MIXED. Sale codes come from `sale_counters` (per-shop, pessimistic-locked). DB CHECK: exactly one of `phone_id`/`accessory_id` per item.
- **`POST /sales`** (`createSale`) — the only sell endpoint. Body: `items[]` (each `{ type, phoneId | (accessoryId + stockEntryId + quantity), unitPrice }`) + optional `note`/`customer`/`debt`. One transaction; each line locks its phone/accessory/batch. `unitPrice` is required per line (frontend prefills the accessory's `salePrice`, seller may change). `totalAmount` = Σ line totals; debt validated against that.
- **Batch selection, not auto-FIFO.** For an accessory line the seller **explicitly picks the stock batch** (`stockEntryId`) to sell from; `cost_price` = that batch's exact `purchasePrice` (no blending). `AccessoriesService.consumeLayer` locks the chosen layer, checks `remaining_quantity ≥ qty` (else `INSUFFICIENT_STOCK`, `details.available`), decrements it, then `recalcAccessory`. The batch picker reads **`GET /accessories/:id/stock?available=true`** (only layers with units left, oldest-first).
- Phone line: locks phone, flips IN_STOCK→SOLD (`cost_price` = phone's `purchasePrice`, qty always 1). Structural errors (missing id, duplicate phone/batch in one sale) → `SALE_LINE_INVALID`.
- **Returns** (`sale_returns`, per `sale_item`): restore stock — phone→IN_STOCK; **accessory → `AccessoriesService.addReturnLayer`** (returned units re-enter as their own layer valued at the sale's `cost_price`, tagged `sale_return_id` so stats don't count it as a purchase). Reduce any OPEN debt by the refund, recompute sale `status` (COMPLETED/PARTIALLY_RETURNED/RETURNED). Refund capped at the proportional sold amount.
- **Profit** per sale = `(unitPrice − costPrice) × netQty` **plus amount retained on returned units** (customer paid, refunded less, goods came back).

### Debts
1:1 with a sale (`debts`, unique `sale_id`). `OPEN`/`PAID`/`CANCELLED`; **OVERDUE is never stored** — computed as `OPEN AND dueDate < today`. Partial repayments recorded in `debt_payments`.

### Expenses
Flat `amount` + `note` + `spentAt` (date). Used as cash-out in stats.

### Statistics
`summary` + `daily`, hand-written SQL grouped by shop-local day. Reports phone/accessory purchased vs sold vs returned vs in-stock, debts, expenses, and `totals` (grossProfit, netProfit, cashIn, cashOut). Accessory "purchased" reads intake layers (`accessory_stock_entries` where `sale_return_id IS NULL`); "remaining" value = Σ `remaining_quantity × purchase_price`; phone "purchased" from `phones.created_at`.

## Conventions to follow

- New tenant-scoped table → add `shop_id` (uuid) + an index on it; filter every query by `shopId` from `@CurrentShop()`.
- Response shape → a dedicated `*ResponseDto` with a static `from(entity)` mapper; controllers map entities→DTOs, they don't leak entities.
- New error case → add an `ErrorCode`, throw via `BusinessException`.
- Mutating stock/sequence/status → transaction + pessimistic lock, mirror `accessories.service.addStock` / `sales.service`.
- Money columns → `numeric(14,2)` + `numericTransformer`. Dates for ranges → local `YYYY-MM-DD`, convert with `tz.util`.
- **Purchase price can be 0** (free intake) for phones and accessories — those DTOs use `@Min(0)`, not `@IsPositive()`. Sale/list prices stay positive.
- After API changes, run `npm run openapi:export` so the frontend contract stays current.
```
