# Phone & Accessory Shop — Backend

Multi-tenant REST API for a small retail shop that sells new/used phones and
accessories. Built with **NestJS 11**, **PostgreSQL 15+**, **TypeORM 0.3**
(migrations only, no `synchronize`), JWT auth, and Swagger.

Every business table is scoped by `shopId` taken from the JWT — never from the
request body — so one account's data is fully isolated from another's.

## Requirements

- Node.js 20+
- PostgreSQL 15+ (or use the bundled `docker-compose.yml`)

## Setup

```bash
npm install
cp .env.example .env        # then edit DB credentials + JWT secret
```

### Start PostgreSQL with Docker

```bash
docker compose up -d
```

This starts Postgres on the port from `DB_PORT` (default 5432) with the
credentials from your `.env`.

### Run migrations

The schema is created **only** through migrations — `synchronize` is off.

```bash
npm run migration:run       # apply
npm run migration:revert    # roll back the last migration
```

### Run the app

```bash
npm run start:dev           # watch mode
npm run start               # once
npm run start:prod          # from built dist/
```

- API base path: `http://localhost:3000/api`
- Swagger UI: `http://localhost:3000/api/docs`
- Uploaded images are served from `http://localhost:3000/uploads/...`

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | |
| `PORT` | `3000` | |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | — | Postgres connection |
| `JWT_ACCESS_SECRET` | — | required, ≥16 chars |
| `JWT_ACCESS_TTL` | `15m` | access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | refresh token lifetime |
| `INVITE_CODE` | empty | set to gate registration; empty = open signups |
| `UPLOADS_DIR` | `./uploads` | local disk store for images |
| `THROTTLE_TTL_MS` / `THROTTLE_LIMIT` | `60000` / `5` | rate limit on `/auth/*` |

## OpenAPI export

```bash
npm run openapi:export      # writes ./openapi.json (DB must be reachable)
```

The Vue frontend prompt can be generated from this file.

## Tests

Integration tests run against a real Postgres database (`shop_test` by default,
port 5433 — override with `TEST_DB_*` env vars). They cover the critical rules:

- shop isolation (A cannot read or mutate B's rows)
- phone sale with debt (paid/debt split, phone marked SOLD, debtor listed)
- over-return rejection (`RETURN_EXCEEDS_SOLD`)
- insufficient-stock rejection (`INSUFFICIENT_STOCK`)
- statistics summary aggregate

```bash
createdb shop_test          # once
npm run test:e2e
```

## Architecture notes

- **Money** is `numeric(14,2)` read back as `number` via a column transformer;
  amounts are aggregated in SQL, never summed across rows in JS. Currency is UZS.
- **Timestamps** are `timestamptz`; date-range filters are inclusive and
  interpreted in `Asia/Tashkent`, converted to UTC boundaries in queries.
- **Soft delete** (`deletedAt`) on `phones`, `accessories`, `expenses`.
- **Transactions** wrap every multi-table operation (sales, returns, stock).
- **Errors** share one shape — `{ statusCode, code, message, details }` — where
  `code` is a stable string the frontend keys off (see
  `src/common/errors/error-codes.ts`).
- A single `Sale` + `SaleItem` model backs both phone and accessory sales, so
  returns, debts and statistics share one code path.

## Module map

```
src/
  common/       filters, decorators (@CurrentShop), numeric transformer,
                pagination, tz + phone utils, base entities
  config/       env validation (Joi), typed config
  database/     DataSource, DatabaseModule, migrations
  auth/         register / login / refresh / logout / me / password, JWT guard
  shop/         shop settings
  uploads/      image upload + resize (sharp), swappable StorageService
  phones/       CRUD, search, spec-card label (no prices)
  accessories/  CRUD + stock entries (denormalized quantity)
  sales/        sell phone / accessory, returns, per-shop sale codes
  debts/        list (computed overdue), pay, extend
  expenses/     CRUD (soft delete)
  statistics/   summary + daily series (SQL aggregates)
```
