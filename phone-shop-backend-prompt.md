# Backend Prompt — Phone & Accessory Shop Inventory (NestJS + PostgreSQL + TypeORM)

> Paste this whole file into Claude Code as the initial task. Ask it to confirm the plan first, then build **step by step** (see "Build order" at the end). Do not let it generate everything in one shot.

---

## 1. Context

Build the **backend only** for a small retail shop management system. A shop sells **new and used phones** plus **accessories**. Used phones are bought from walk-in sellers and resold with a markup. Occasionally a customer is short on cash, so the shop lets them owe the remainder for a few days — this is a one-time debt, **not** installment financing.

The product is multi-tenant: anyone can register, and registration creates a **shop** with a single owner account. One shop = one account for now (no staff accounts yet), but all data must be scoped by shop from day one.

The frontend will be a Vue 3 SPA built later against these APIs. Your job: a clean, production-ready REST API. Keep it **simple** — this is a small shop tool, not an ERP. Do not add features that are not in this spec.

## 2. Stack & hard requirements

- NestJS 10+, TypeScript with `strict: true`
- PostgreSQL 15+, TypeORM 0.3 (`DataSource`, **`synchronize: false`**, real migrations only)
- `@nestjs/config` with schema-validated env (Joi or zod)
- Auth: JWT access token (15m) + refresh token (30d, stored hashed in DB, rotated on use), `argon2` for password hashing
- `@nestjs/throttler` on all `/auth/*` routes (e.g. 5 req/min per IP)
- Validation: `class-validator` + `class-transformer`, global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
- Swagger at `/api/docs`, fully annotated DTOs, plus a script exporting `openapi.json` to the repo root
- File uploads: `multer` to local disk `./uploads`, served statically, images resized to max 1280px with `sharp`. Keep it behind a small `StorageService` interface so S3/MinIO can be swapped in later.
- Logging: `nestjs-pino` with request ids
- Global exception filter with a consistent error shape:
  ```json
  { "statusCode": 400, "code": "PHONE_ALREADY_SOLD", "message": "...", "details": {} }
  ```
  Every business rule violation gets its own stable `code` string — the frontend keys off these.

### Non-negotiable data rules

- **Multi-tenancy:** every business table carries `shopId` (FK → `shops`, indexed, NOT NULL). Every single query is filtered by the `shopId` from the JWT. Never read `shopId` from the request body or params. Implement a `@CurrentShop()` param decorator and make it the only way services learn the shop id. Write one integration test proving shop A cannot read or mutate shop B's rows.
- **Money:** `numeric(14,2)` columns with a `ColumnNumericTransformer` returning `number`. Never `float`/`real`. Never sum money in JS across rows — aggregate in SQL. Currency is UZS only; no currency column.
- **Timestamps:** `timestamptz` everywhere. App timezone `Asia/Tashkent`. Date-range filters are inclusive and interpreted in shop-local time, converted to UTC boundaries in the query.
- **Soft delete:** `deletedAt` on `phones`, `accessories`, `expenses`. Deletion is only allowed for mistakenly created rows (see business rules), but keep the row so nothing dangles.
- **Transactions:** every operation touching more than one table runs inside `dataSource.transaction(...)`.

---

## 3. Data model

UUID primary keys (`gen_random_uuid()`).

### `shops`
`id`, `name` (do'kon nomi — printed at the top of the spec label), `address` nullable, `phone` nullable, `labelFooter` nullable, `createdAt`, `updatedAt`.

### `users`
| field | type | notes |
|---|---|---|
| id | uuid | |
| shopId | uuid FK | |
| fullName | varchar | |
| login | citext unique | 3–32 chars, `^[a-zA-Z0-9._-]+$`, stored lowercase, **globally unique** |
| passwordHash | varchar | argon2 |
| role | enum `OWNER` | only value for now; keep the column so staff roles are additive later |
| isActive | boolean default true | |

No phone-number login, no OTP.

### `refresh_tokens`
`id`, `userId`, `tokenHash`, `expiresAt`, `revokedAt` nullable, `createdAt`.

### `phones`
| field | type | notes |
|---|---|---|
| id | uuid | |
| shopId | uuid FK | |
| name | varchar | e.g. "Samsung Galaxy A54 5G" |
| imei | varchar(20) | **required**, digits only, 10–20 chars |
| purchasePrice | numeric(14,2) | **required** — what the shop paid |
| listPrice | numeric(14,2) nullable | optional asking price, for internal reference only — the real price is negotiated and entered at sale time. Never appears on the printed label. |
| condition | enum `NEW` \| `USED` nullable | optional |
| ramGb | int nullable | |
| storageGb | int nullable | |
| imageUrl | varchar nullable | |
| note | text nullable | |
| status | enum `IN_STOCK` \| `SOLD` | default `IN_STOCK` |
| createdAt, updatedAt, deletedAt | | |

Unique index: `(shop_id, imei) WHERE deleted_at IS NULL AND status = 'IN_STOCK'` — the same IMEI can legitimately come back to the shop later after being sold, so only in-stock duplicates are blocked.

### `accessories`
`id`, `shopId`, `name`, `purchasePrice` (required), `salePrice` nullable, `quantity` int `>= 0`, `imageUrl` nullable, `note` nullable, timestamps, `deletedAt`.

### `accessory_stock_entries`
`id`, `shopId`, `accessoryId`, `quantity`, `purchasePrice`, `note` nullable, `createdAt`.

The intake form asks for **quantity** (this was missing from the original sketch). Restocking the same accessory at a different cost creates a new entry rather than overwriting the old price. `accessories.quantity` is a denormalized running total, updated in the same transaction as the entry. `accessories.purchasePrice` reflects the **latest** entry.

### `sales`
| field | notes |
|---|---|
| id, shopId | |
| code | human-readable sequence per shop, e.g. `S-000123` |
| type | enum `PHONE` \| `ACCESSORY` — denormalized so the UI tabs are a cheap single-column filter |
| totalAmount, paidAmount, debtAmount | numeric(14,2) |
| status | enum `COMPLETED` \| `PARTIALLY_RETURNED` \| `RETURNED` |
| note | text nullable |
| soldBy (userId), soldAt | |

### `sale_items`
`id`, `shopId`, `saleId`, `itemType` enum `PHONE` \| `ACCESSORY`, `phoneId` nullable, `accessoryId` nullable, `quantity` int (always 1 for phones), `unitPrice`, `costPrice`, `lineTotal`, `returnedQuantity` int default 0.

`costPrice` is a **snapshot** of the purchase price at sale time. Profit is computed from this snapshot only, never from the current `purchasePrice`, so editing a product later cannot rewrite past profit.

DB CHECK: exactly one of `phoneId` / `accessoryId` is set, matching `itemType`.

> A `Sale` header + `SaleItem` rows is used instead of two separate "sold phones" / "sold accessories" tables. The UI still shows two tabs (filter by `type`), but returns, debts and statistics all get one code path instead of two duplicated ones.

### `sale_returns`
`id`, `shopId`, `saleId`, `saleItemId`, `quantity`, `amount`, `reason` (text, required), `createdBy`, `createdAt`.

### `debts`
`id`, `shopId`, `saleId` (unique), `customerName` (required), `customerPhone` (required, normalized `998XXXXXXXXX`), `amount`, `dueDate` (date), `status` enum `OPEN` \| `PAID` \| `CANCELLED`, `paidAt` nullable, `note` nullable, `createdAt`.

No installments, no payments table — a debt is settled in one action. `OVERDUE` is **not** a stored status; it is computed at read time as `status = 'OPEN' AND dueDate < today`. No cron job.

### `expenses`
`id`, `shopId`, `amount` (required), `note` (required), `spentAt` (date, default today), `createdBy`, timestamps, `deletedAt`.

### Indexes (create explicitly in migrations)
Every `shopId` column. Plus `phones(shop_id, status, created_at)`, `phones(shop_id, imei)`, `LOWER(phones.name)`, `sales(shop_id, sold_at)`, `sales(shop_id, type, sold_at)`, `sale_items(sale_id)`, `debts(shop_id, status, due_date)`, `expenses(shop_id, spent_at)`, `accessory_stock_entries(accessory_id, created_at)`.

---

## 4. Business rules

### Auth

**Register** — `POST /auth/register`
```
{ shopName, fullName, login, password, confirmPassword, inviteCode? }
```
One transaction: create `shops` row, then the `OWNER` user, then return access + refresh tokens (auto-login). `password` min 8 chars; `confirmPassword` must match (validate server-side too, not only in the UI). Duplicate login → `LOGIN_ALREADY_TAKEN`.

If `INVITE_CODE` is set in env, the field is required and must match; if the env var is empty, registration is open. This is a two-line guard that lets you close signups without a code change.

**Login** — `POST /auth/login { login, password }`. Same generic error (`INVALID_CREDENTIALS`) for unknown login and wrong password — do not leak which one it was.

### Phones

- `POST /phones` → `IN_STOCK`. Required: `name`, `imei`, `purchasePrice`. Optional: `listPrice`, `condition`, `ramGb`, `storageGb`, `imageUrl`, `note`. Duplicate in-stock IMEI → `IMEI_ALREADY_EXISTS`, with the conflicting phone id in `details`.
- `POST /sales/phone`
  ```
  { phoneId, price, note?, debt?: { amount, dueDate, customerName, customerPhone } }
  ```
  In one transaction: load the phone with `FOR UPDATE`, assert `IN_STOCK` (else `PHONE_ALREADY_SOLD`), create `Sale` + `SaleItem` with `costPrice = phone.purchasePrice`, set `phone.status = SOLD`.
  If `debt` is present: `amount > 0`, `amount <= price` (`DEBT_EXCEEDS_TOTAL`), `dueDate >= today` (`DUE_DATE_IN_PAST`), `customerName` and `customerPhone` required (`CUSTOMER_REQUIRED_FOR_DEBT`). `paidAmount = price - debt.amount`.
- `PATCH /phones/:id` — allowed only while `IN_STOCK`, except `note` / `imageUrl` which stay editable.
- `DELETE /phones/:id` — soft delete, **only while `IN_STOCK`** (else `PHONE_ALREADY_SOLD`). This is for rows created by mistake.
- `GET /phones/:id/label` — returns a ready-to-render payload for the printed spec card. **This is a specification card, not a price tag: it must never contain any price field.** Returns: `shopName`, phone `name`, `memory` pre-formatted as `"8 GB / 256 GB"` (omit the field entirely if both are null), `condition` label if set, `imei`, `labelFooter`. Nothing else. No HTML or PDF generation on the backend — the Vue app owns the 58/80mm thermal layout.

### Accessories

- `POST /accessories` — required: `name`, `purchasePrice`, `quantity`. Optional: `salePrice`, `imageUrl`, `note`. Creates the accessory plus its first stock entry in one transaction.
- `POST /accessories/:id/stock { quantity, purchasePrice, note? }` — new intake; increments `quantity`, updates `purchasePrice` to the new value.
- `POST /sales/accessory { accessoryId, quantity, unitPrice?, note?, debt? }` — load `FOR UPDATE`, assert `quantity <= accessories.quantity` (`INSUFFICIENT_STOCK`, return the available amount in `details`), decrement. `unitPrice` defaults to `salePrice`; if both are null → `PRICE_REQUIRED`. Debt rules identical to phone sales.
- `DELETE /accessories/:id` — soft delete for mistaken rows.

### Returns — `POST /sales/:id/return { saleItemId, quantity, amount, reason }`

- `quantity <= item.quantity - item.returnedQuantity` (`RETURN_EXCEEDS_SOLD`). The API must make over-returning impossible no matter what the UI sends.
- `amount` defaults to the proportional sold amount and may be **lower**, never higher (`RETURN_AMOUNT_EXCEEDS_SOLD`).
- Phone item → `phone.status` back to `IN_STOCK` (it simply reappears in the available list). Accessory item → `accessories.quantity += quantity`.
- If the sale has an `OPEN` debt: reduce `debt.amount` by the returned amount, floored at 0; if it reaches 0, mark the debt `CANCELLED`.
- Recompute `sale.status`: `RETURNED` when every item is fully returned, otherwise `PARTIALLY_RETURNED`.

### Debts

- `POST /debts/:id/pay { paidAt? }` → `status = PAID`, `paidAt` set. Reject if not `OPEN` (`DEBT_NOT_OPEN`).
- `PATCH /debts/:id { dueDate?, note? }` — the customer asks for a few more days; allow extending.
- No delete. A wrongly created debt is cleared by returning the sale.

### Expenses

Plain CRUD: `amount` + `note` + `spentAt`. Soft delete.

---

## 5. Endpoints

```
POST   /auth/register              { shopName, fullName, login, password, confirmPassword, inviteCode? }
POST   /auth/login                 { login, password }
POST   /auth/refresh
POST   /auth/logout
GET    /auth/me                    → user + shop
PATCH  /auth/password              { currentPassword, newPassword, confirmPassword }

GET    /shop                       → own shop settings
PATCH  /shop                       { name, address?, phone?, labelFooter? }

GET    /phones                     ?status&condition&search(name|imei)&from&to&page&limit&sort
POST   /phones
GET    /phones/:id
PATCH  /phones/:id
DELETE /phones/:id
GET    /phones/:id/label

GET    /accessories                ?search&inStock&page&limit
POST   /accessories
GET    /accessories/:id
PATCH  /accessories/:id
DELETE /accessories/:id
POST   /accessories/:id/stock
GET    /accessories/:id/stock

GET    /sales                      ?type&isDebt&from&to&search&page&limit
GET    /sales/:id
POST   /sales/phone
POST   /sales/accessory
POST   /sales/:id/return
GET    /sales/:id/returns

GET    /debts                      ?status&overdue=true&from&to&search(name|phone)&page&limit
GET    /debts/:id
POST   /debts/:id/pay
PATCH  /debts/:id

GET    /expenses                   ?from&to&search&page&limit
POST   /expenses
PATCH  /expenses/:id
DELETE /expenses/:id

GET    /statistics/summary         ?from&to
GET    /statistics/daily           ?from&to

POST   /uploads/image              multipart, max 5MB, jpeg|png|webp
```

List responses: `{ data: [...], meta: { page, limit, total, totalPages } }`.

The **sold phones tab** is `GET /sales?type=PHONE`, and each row must include the embedded phone snapshot (name, imei, memory, image) plus sale price, cost, profit, debt info and return state — so the frontend renders the tab from one request with no N+1 lookups.

The **debtors page** is `GET /debts?status=OPEN`, each row carrying: customer name and phone, what was sold (product name), total sale amount, `paidAmount`, `amount` still owed, `dueDate`, and a computed `isOverdue` + `daysOverdue`.

---

## 6. Statistics

`GET /statistics/summary?from&to` — defaults: `from` = first day of the current month, `to` = today, Asia/Tashkent, inclusive. Everything computed with **SQL aggregates**, not JS loops over fetched rows.

```jsonc
{
  "range": { "from": "2026-08-01", "to": "2026-08-31" },
  "phones": {
    "purchasedCount": 0, "purchasedAmount": 0,      // intake within range
    "soldCount": 0, "soldAmount": 0, "soldCostAmount": 0, "profit": 0,
    "returnedCount": 0, "returnedAmount": 0,
    "soldOnDebtCount": 0, "soldOnDebtAmount": 0,
    "inStockCount": 0, "inStockCostAmount": 0       // current snapshot, NOT range-bound — label it clearly in the response
  },
  "accessories": {
    "purchasedQty": 0, "purchasedAmount": 0,
    "soldQty": 0, "soldAmount": 0, "soldCostAmount": 0, "profit": 0,
    "returnedQty": 0, "returnedAmount": 0,
    "remainingQty": 0, "remainingCostAmount": 0     // current snapshot
  },
  "expenses": { "count": 0, "total": 0 },
  "debts": {
    "openCount": 0, "openAmount": 0,
    "overdueCount": 0, "overdueAmount": 0,
    "createdInRangeCount": 0, "createdInRangeAmount": 0,
    "collectedInRange": 0
  },
  "totals": {
    "grossProfit": 0,        // phone profit + accessory profit, net of returns
    "netProfit": 0,          // grossProfit - expenses
    "cashIn": 0,             // sale paidAmount + debts settled within range
    "cashOut": 0             // expenses + phone/accessory purchases within range
  }
}
```

Returns are netted out of sold counts, amounts and profit — a returned phone is not a sale. `costPrice` snapshots on `sale_items` are the only cost source.

`GET /statistics/daily?from&to` → one row per day `{ date, salesAmount, profit, expenses, debtCollected }` for charting. Gap days filled with zeros server-side.

---

## 7. Deliverables

1. Modular structure: `auth`, `shop`, `phones`, `accessories`, `sales`, `debts`, `expenses`, `statistics`, `uploads`, `common` (filters, interceptors, decorators, numeric transformer, pagination, `@CurrentShop()`).
2. All migrations written and runnable (`npm run migration:run`). No `synchronize`.
3. `.env.example` + README (setup, migrations, run, `docker-compose.yml` for Postgres).
4. Swagger complete enough that the Vue prompt can be generated from it, plus an `openapi.json` export script.
5. Tests for: shop isolation (A cannot see B), sale-with-debt creation, over-return rejection, insufficient-stock rejection, and the statistics summary aggregate.

## 8. Out of scope — do not build

Frontend, printing/PDF, staff accounts and role permissions, installment payments, customer directory, payment methods (cash/card), multi-currency, barcodes, activity/audit logs, SMS or Telegram notifications, password reset by email. Keep the code structured so staff roles and audit logging can be added later without reshaping the schema, but write none of it now.

## 9. Build order

Separate steps, pause for review after each:

1. Skeleton, config, DB connection, `common` module (exception filter, numeric transformer, pagination, response interceptor), logging.
2. `shops` + `users` + register/login/refresh + JWT guard + `@CurrentShop()` + shop isolation test.
3. Shop settings, uploads.
4. Phones module (CRUD, search, label endpoint) + migrations.
5. Accessories + stock entries.
6. Sales (phone + accessory) with debt creation, and returns — the hard part; write the tests here.
7. Debts (list, pay, extend).
8. Expenses.
9. Statistics.
10. Swagger polish, `openapi.json` export, README.
