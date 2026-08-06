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

### Accessories — quantity model with intake log
`accessories` has a **denormalized `quantity`** kept in sync with stock entries + sales, and `purchasePrice` = *latest* intake cost.
`accessory_stock_entries` is the **intake/приход log** — one row per intake (`quantity`, `purchasePrice`, `note`, `createdAt`).
- Create accessory → also writes the opening stock entry.
- `POST /accessories/:id/stock` (`addStock`) → appends a stock entry, bumps `quantity`, sets `purchasePrice` to the new cost. All in one locked transaction.
- `GET /accessories/:id/stock` → intake history.
- "Sold" views (`/accessories/sold`, `/accessories/:id/sold`) aggregate from `sale_items` in raw SQL.

### Stock receipts — grouped accessory intake ("prixod / kirim")
`stock_receipts` (header: `code` `P-000123`, optional supplier, denormalized `total_amount`/`total_qty`/`item_count`, `received_at`) + `stock_receipt_items` (line: `accessory_id`, `quantity`, `purchasePrice`, `lineTotal`). Codes from `stock_receipt_counters` (per-shop, pessimistic lock, same pattern as sales).
- `POST /stock-receipts`: one transaction. Each line either restocks an **existing** accessory (`accessoryId`) or **creates a new** one inline (`newAccessory`) — exactly one of the two per line (else `RECEIPT_LINE_INVALID`). Every line then calls the shared `AccessoriesService.applyIntake()` (writes an `accessory_stock_entries` row tagged with `receipt_id`, bumps `quantity`, refreshes `purchasePrice`).
- `GET /stock-receipts` (paginated, search by code/supplier, date range) and `GET /stock-receipts/:id` (with lines).
- `PATCH /stock-receipts/:id`: **fully replaces** the line set. Applies the net per-accessory delta (`newQty − oldQty`); if that would push an accessory below its current stock (units already sold) → `INSUFFICIENT_STOCK` (`details.available`). Rewrites the receipt's stock entries (dated at `receivedAt` to keep "latest cost" ordering) + line items, then `AccessoriesService.refreshLatestCost` recomputes each accessory's `purchasePrice` from its newest remaining entry.
- `DELETE /stock-receipts/:id`: reverses the intake; refused with `INSUFFICIENT_STOCK` if any received unit was already sold.
- Stats need no change — they read intake from `accessory_stock_entries`.
- Quantity + purchase price of an accessory are owned by receipts. The accessory's own edit (`PATCH /accessories/:id`) leaves `quantity` untouched and, by convention, the frontend also stops sending `purchasePrice` there — but the field stays optional in the DTO (not removed), so it's available if needed.
- Intake logic lives in `AccessoriesService.applyIntake` / `lockAccessory` / `refreshLatestCost`; single `addStock` and grouped receipts both go through them. Do not duplicate the quantity-bump logic elsewhere.

### Sales
`sales` (header: `code` `S-000123`, `type` PHONE/ACCESSORY, totals, `status`, optional customer, optional debt) + `sale_items` (line: `costPrice` is a **snapshot** of purchase price at sale time — never recomputed; `returnedQuantity` for partial returns). Sale codes come from `sale_counters` (per-shop, pessimistic-locked). DB CHECK: exactly one of `phone_id`/`accessory_id` per item.
- `sellPhone`: locks phone, flips IN_STOCK→SOLD.
- `sellAccessory`: locks accessory, checks stock, decrements `quantity`.
- **Returns** (`sale_returns`): restore stock (phone→IN_STOCK, accessory→`quantity += n`), reduce any OPEN debt by the refund, recompute sale `status` (COMPLETED/PARTIALLY_RETURNED/RETURNED). Refund is capped at the proportional sold amount.
- **Profit** per sale = `(unitPrice − costPrice) × netQty` **plus amount retained on returned units** (customer paid, refunded less, goods came back).

### Debts
1:1 with a sale (`debts`, unique `sale_id`). `OPEN`/`PAID`/`CANCELLED`; **OVERDUE is never stored** — computed as `OPEN AND dueDate < today`. Partial repayments recorded in `debt_payments`.

### Expenses
Flat `amount` + `note` + `spentAt` (date). Used as cash-out in stats.

### Statistics
`summary` + `daily`, hand-written SQL grouped by shop-local day. Reports phone/accessory purchased vs sold vs returned vs in-stock, debts, expenses, and `totals` (grossProfit, netProfit, cashIn, cashOut). Accessory "purchased" figures read from `accessory_stock_entries`; phone "purchased" from `phones.created_at`.

## Conventions to follow

- New tenant-scoped table → add `shop_id` (uuid) + an index on it; filter every query by `shopId` from `@CurrentShop()`.
- Response shape → a dedicated `*ResponseDto` with a static `from(entity)` mapper; controllers map entities→DTOs, they don't leak entities.
- New error case → add an `ErrorCode`, throw via `BusinessException`.
- Mutating stock/sequence/status → transaction + pessimistic lock, mirror `accessories.service.addStock` / `sales.service`.
- Money columns → `numeric(14,2)` + `numericTransformer`. Dates for ranges → local `YYYY-MM-DD`, convert with `tz.util`.
- **Purchase price can be 0** (free intake) for phones and accessories — those DTOs use `@Min(0)`, not `@IsPositive()`. Sale/list prices stay positive.
- After API changes, run `npm run openapi:export` so the frontend contract stays current.
```
