# Frontend Prompt — Phone & Accessory Shop (Vue 3 + TypeScript SPA)

> Paste this whole file into Claude Code as the initial task. Ask it to confirm the plan first, then build **step by step** (see "Build order" at the end). Do not let it generate everything in one shot. The backend already exists and is documented — its `openapi.json` sits at the repo root and Swagger is at `http://localhost:3000/api/docs`.

---

## 1. Context

Build the **frontend only** for a small retail shop management tool. A shop sells **new and used phones** plus **accessories**. Used phones are bought from walk-in sellers and resold. Sometimes a customer pays part now and owes the rest for a few days — a one-time debt, not installments.

The backend is a finished NestJS REST API (multi-tenant, one shop = one owner account). This app is the owner's daily driver. It is used **mainly on a phone** (the owner stands at the counter with it), but must also work well on a desktop browser. So: **mobile-first, but responsive up to desktop.**

The UI must be **simple and immediately understandable** — the user is a shopkeeper, not a power user — but also **polished, modern and pleasant**, with smooth, tasteful animations. It should feel like a native mobile app, not a spreadsheet.

**UI language: Uzbek (Latin script).** All visible copy is in Uzbek. Money is UZS. Phone numbers are `998XXXXXXXXX`. Keep a small i18n dictionary so strings live in one place (even if only one language ships now).

Keep it **simple** — this is a small shop tool, not an ERP. Do not add features that aren't backed by an endpoint in this spec.

---

## 2. Stack & hard requirements

- **Vue 3** (`<script setup>` SFCs) + **TypeScript** (`strict: true`)
- **Vite** build
- **Vue Router 4** — route guards for auth
- **Pinia** — state (auth/session, shop profile, UI prefs)
- **TanStack Query for Vue** (`@tanstack/vue-query`) — all server data: caching, background refetch, mutations, optimistic updates where it helps
- **Axios** — one configured instance with interceptors (auth header, refresh-on-401, error normalisation)
- **Tailwind CSS** — styling; a small design-token layer on top (see §3). No heavy component framework — build the components, keep the bundle lean and the look consistent
- **Animations:** `@vueuse/motion` (or Vue built-in `<Transition>`/`<TransitionGroup>`) for enter/leave, list reordering, page transitions, and micro-interactions. Optionally `@formkit/auto-animate` for list add/remove. Keep animations fast (150–250ms), spring/ease-out, and **respect `prefers-reduced-motion`**
- **Forms & validation:** `vee-validate` + `zod` (or `@vee-validate/zod`). Mirror the backend rules client-side for instant feedback, but always trust the server's error `code`
- **Charts:** a lightweight lib for the statistics screen — `vue-chartjs` (Chart.js) or `unovis`/`echarts`. One consistent chart style
- **Icons:** `lucide-vue-next`
- **Toasts:** `vue-sonner` (or a tiny custom toaster) for success/error feedback
- **HTTP types:** generate TypeScript types from the backend `openapi.json` (e.g. `openapi-typescript`) into `src/api/schema.d.ts`, OR hand-write DTO types in `src/api/types.ts`. Either way, no `any` on API boundaries
- **Dates:** `date-fns` (+ `date-fns-tz` if needed). App timezone is **Asia/Tashkent**; the backend interprets date ranges in that zone
- Linting/formatting: ESLint + Prettier, TS strict, no `any`, no unused

**Config:** `VITE_API_BASE_URL` env var (default `http://localhost:3000/api`). All requests go through the axios instance — never hardcode URLs in components.

---

## 3. Design system

Mobile-first. Design for a **390px-wide phone** first, then scale up. On desktop, center content in a comfortable max-width and use the extra space for side-by-side panels — never just stretch mobile layouts.

### Look & feel
- Clean, airy, rounded. Card-based surfaces, generous spacing, large tap targets (min 44px).
- One **primary brand color** + neutral grays + semantic colors (success green, danger red, warning amber, info blue). Pick a calm, trustworthy primary (e.g. indigo/blue). Define everything as CSS variables / Tailwind theme tokens so it can be re-themed in one place.
- **Light and dark mode**, toggle in settings, persisted, respects system preference by default. Both must look intentional (test contrast).
- Typography: one clean sans (e.g. Inter). Clear hierarchy — big bold numbers for money/stats, quiet labels.
- Money is the hero on most screens. Format UZS with thousands separators and the `so'm` suffix (e.g. `3 000 000 so'm`). Build a `formatMoney()` helper and use it everywhere — never print raw numbers.

### Motion
- **Page transitions:** subtle slide/fade between routes (respect nav direction where it reads naturally, e.g. push in / pop out on mobile).
- **Lists:** stagger-in on load, animate add/remove/reorder.
- **Sheets & modals:** bottom-sheet on mobile (slides up), centered dialog on desktop; backdrop fade.
- **Feedback:** button press states, success checkmarks, skeleton loaders (not spinners) for content, number count-up on the stats screen.
- Keep it snappy. Never block interaction behind an animation. Always honor `prefers-reduced-motion`.

### Core shared components (build these once)
`AppButton` (variants: primary/secondary/ghost/danger, loading state), `AppInput`, `AppSelect`, `AppTextarea`, `MoneyInput` (formats as you type), `BottomSheet` (mobile) / `AppDialog` (desktop), `ConfirmDialog`, `Toast`, `Card`, `StatTile`, `Badge`/`StatusPill`, `Avatar`, `EmptyState`, `SkeletonBlock`, `Pagination` / infinite-scroll loader, `SearchBar` (debounced), `DateRangePicker`, `ImageUploader` (calls `POST /uploads/image`, shows preview + progress; **validate client-side: jpeg/png/webp, max 2MB** before sending, since the server rejects anything larger), `Segmented`/`Tabs`, `FAB` (floating action button for "add"), `PullToRefresh` (mobile).

---

## 4. App shell & navigation

**Mobile:** a fixed **bottom tab bar** with 4–5 primary destinations + a central **FAB** for the most common action (new sale). Tabs:
1. **Bosh sahifa** (Dashboard / statistics)
2. **Telefonlar** (Phones)
3. **＋ Sotuv** (central FAB → new sale flow)
4. **Aksessuarlar** (Accessories)
5. **Ko'proq** (More: Sales history, Debts, Expenses, Settings)

**Desktop:** collapse the bottom bar into a **left sidebar** with the full list of destinations; content area to the right with the same screens. A top bar shows the shop name, dark-mode toggle, and account menu.

Every authenticated screen lives inside this shell. Auth screens (login/register) are outside it (full-screen, centered).

---

## 5. Auth & session

Token model (from backend): **access token (JWT, 15m)** used as `Authorization: Bearer`, and a **refresh token (30d, rotated on every use)**.

- **Storage:** keep tokens in memory (Pinia) + persist to `localStorage` so a reload keeps the session. (Note the XSS trade-off in a code comment; acceptable for this internal tool.)
- **Axios request interceptor:** attach the access token.
- **Axios response interceptor:** on `401`, call `POST /auth/refresh { refreshToken }` **once**, store the rotated pair, and retry the original request. Queue concurrent 401s so only one refresh happens. If refresh fails → clear session → redirect to login.
- **Router guard:** protected routes require a session; unauthenticated → `/login`. Logged-in users hitting `/login`/`/register` → dashboard.
- On app boot, if tokens exist, call `GET /auth/me` to hydrate user + shop (and validate the session).

### Screens
- **Login** — `POST /auth/login { login, password }`. Show the generic `INVALID_CREDENTIALS` message ("Login yoki parol noto'g'ri") — do not reveal which was wrong.
- **Register** — `POST /auth/register { shopName, fullName, login, password, confirmPassword, inviteCode? }`. Auto-login on success (store returned tokens). Validate `login` (3–32, `^[a-zA-Z0-9._-]+$`), password ≥8, confirm match — client-side, but surface server codes (`LOGIN_ALREADY_TAKEN`, `PASSWORD_MISMATCH`, `INVITE_CODE_REQUIRED`, `INVITE_CODE_INVALID`). Show the invite-code field only when a first submit returns `INVITE_CODE_REQUIRED` (or always show it as optional).
- **Logout** — `POST /auth/logout { refreshToken }`, clear session.
- **Change password** (in Settings) — `PATCH /auth/password { currentPassword, newPassword, confirmPassword }`. On success, the backend revokes all sessions → force re-login.

---

## 6. API layer & error handling

- One typed client module per resource (`src/api/phones.ts`, `sales.ts`, …) wrapping the axios instance and returning typed data. Wrap them in TanStack Query hooks (`usePhones`, `useCreatePhone`, …).
- **List responses** are `{ data: [...], meta: { page, limit, total, totalPages } }`. Build a generic `Paginated<T>` type and a reusable list hook that handles page/limit/filters and (on mobile) infinite scroll.
- **Every error** from the backend has the shape `{ statusCode, code, message, details }`. Centralise a `mapErrorCode(code, details) → user-facing Uzbek string`. Unknown codes fall back to a generic message. Wire this into a global error handler → toast, and into forms → field/inline errors.

Map at least these codes to friendly Uzbek copy (some carry useful `details`):

| code | meaning | note / details |
|---|---|---|
| `INVALID_CREDENTIALS` | login/parol noto'g'ri | |
| `LOGIN_ALREADY_TAKEN` | bu login band | |
| `PASSWORD_MISMATCH` | parollar mos emas | |
| `CURRENT_PASSWORD_INVALID` | joriy parol noto'g'ri | |
| `INVITE_CODE_REQUIRED` / `INVITE_CODE_INVALID` | taklif kodi kerak / noto'g'ri | |
| `IMEI_ALREADY_EXISTS` | bu IMEI zaxirada mavjud | `details.phoneId` → offer to open it |
| `PHONE_ALREADY_SOLD` | telefon allaqachon sotilgan | block edit/delete/sell |
| `INSUFFICIENT_STOCK` | zaxira yetarli emas | `details.available` → show remaining |
| `PRICE_REQUIRED` | narx kiritilishi shart | |
| `DEBT_EXCEEDS_TOTAL` | qarz summasi sotuv narxidan katta | |
| `DUE_DATE_IN_PAST` | muddat o'tib ketgan sana | |
| `CUSTOMER_REQUIRED_FOR_DEBT` | qarz uchun mijoz ismi va tel. kerak | |
| `DEBT_NOT_OPEN` | qarz allaqachon yopilgan | |
| `RETURN_EXCEEDS_SOLD` | qaytarish miqdori sotilganidan ko'p | `details.remaining` |
| `RETURN_AMOUNT_EXCEEDS_SOLD` | qaytarish summasi juda katta | `details.maxAmount` |
| `NOT_FOUND` | topilmadi | |
| `VALIDATION_FAILED` | ma'lumot noto'g'ri | may carry `details.errors[]` |

**Loading / empty / error states are mandatory** on every data screen: skeletons while loading, a friendly `EmptyState` (illustration + call-to-action) when there's nothing, and a retry affordance on failure. Never show a blank screen.

---

## 7. Screens (mapped to endpoints)

### 7.1 Dashboard — `Bosh sahifa`
The landing screen. Data from **`GET /statistics/summary?from&to`** and **`GET /statistics/daily?from&to`** (default range = current month, Asia/Tashkent).

- A **date-range picker** at top (presets: Bugun / Shu hafta / Shu oy / Oraliq). Re-fetches both endpoints.
- **StatTiles** with count-up animation for the headline numbers: `totals.grossProfit`, `totals.netProfit`, `totals.cashIn`, `totals.cashOut`, plus phones sold/profit and accessories sold/profit.
- Clearly label the two **current-snapshot** figures (`phones.inStockCount` / `inStockCostAmount`, `accessories.remainingQty` / `remainingCostAmount`) as "hozirgi holat" — they are NOT range-bound.
- A **debts summary** card: `debts.openCount`/`openAmount`, `overdueCount`/`overdueAmount` (highlight overdue in red), and a shortcut to the debtors page.
- A **chart** from `/statistics/daily`: one row per day `{ date, salesAmount, profit, expenses, debtCollected }`, gap-days already zero-filled by the server. Line/bar chart of sales & profit over the range.
- Pull-to-refresh on mobile.

### 7.2 Phones — `Telefonlar`
List: **`GET /phones?status&condition&search&from&to&page&limit&sort&order`**.

- Search bar (matches name or IMEI, debounced), filter chips for `status` (IN_STOCK/SOLD) and `condition` (NEW/USED), sort (createdAt/name/purchasePrice).
- Each row/card: image (or placeholder), name, memory (`ramGb/storageGb`), condition badge, IMEI (may be null — omit gracefully), a `StatusPill` (Sotuvda / Sotilgan). **For SOLD phones show both prices side by side**: `purchasePrice` (olingan) and `salePrice` (sotilgan), plus `profit` — the API now returns `salePrice`/`profit` on phone responses (null while in stock). For in-stock phones show `purchasePrice`. Infinite scroll on mobile, pagination on desktop.
- **FAB → Add phone** (`POST /phones`): fields name + purchasePrice (required); **imei is optional** (digits 10–20 when given); optional listPrice, condition, ramGb, storageGb, note, and image via `ImageUploader`. Handle `IMEI_ALREADY_EXISTS` → toast with a "Mavjud telefonni ochish" action using `details.phoneId`.
- **Phone detail** (`GET /phones/:id`): full info + actions. For a SOLD phone, surface `purchasePrice`, `salePrice` and `profit` prominently. Handle a null IMEI cleanly.
  - **Edit** (`PATCH /phones/:id`) — while IN_STOCK all fields; when SOLD only note/image are editable (disable the rest, explain why).
  - **Delete** (`DELETE /phones/:id`) — only while IN_STOCK, with a confirm dialog. If sold → the button is hidden/disabled (`PHONE_ALREADY_SOLD`).
  - **Sell this phone** → opens the sale flow (§7.4) pre-selected.
  - **Print label** (`GET /phones/:id/label`) → a **spec card** preview: `shopName`, name, `memory` (already formatted like `8 GB / 256 GB`, omit if absent), condition, imei, labelFooter. **Never show any price on the label.** Backend returns data only — the frontend owns the 58/80mm thermal layout (a clean printable card via `@media print` / a print view). Provide a "Chop etish" button.

### 7.3 Accessories — `Aksessuarlar`
Two tabs at the top (segmented): **Mavjud** (in stock) and **Sotilgan** (sold).

**Mavjud tab** — List: **`GET /accessories?search&inStock&page&limit`**.

- Search + an `inStock` toggle (faqat mavjudlar). Card: image, name, sale price, **quantity** (highlight low/zero stock).
- **FAB → Add accessory** (`POST /accessories`): name, purchasePrice, quantity (all required); optional salePrice, note, image. Backend creates the first stock entry automatically.
- **Accessory detail** (`GET /accessories/:id`):
  - **Edit** (`PATCH /accessories/:id`) — name/prices/note/image. Quantity is NOT directly editable (explain: stock changes via intake or sales).
  - **Add stock / intake** (`POST /accessories/:id/stock { quantity, purchasePrice, note? }`) — restocking at a possibly different cost. Show the running total update.
  - **Stock history** (`GET /accessories/:id/stock`) — list of intake entries (quantity, purchasePrice, date, note), newest first.
  - **Sell** → sale flow (§7.4) pre-selected.
  - **Delete** (`DELETE /accessories/:id`) — soft delete, confirm dialog.

**Sotilgan tab** — aggregated sold accessories: **`GET /accessories/sold?search&page&limit`**.

- Just like the in-stock list, **one row per accessory**, but keyed on what's been sold. Each row (an aggregate across all its sales, net of returns): image, name, **`soldQty`** (e.g. "14 ta sotilgan"), `soldAmount` (sotilgan jami), `soldCostAmount` (olingan jami), **`profit`**, and `currentQuantity` (hozir zaxirada). Show olingan/sotilgan/foyda clearly.
- **Tap a row → sold detail** (`GET /accessories/:id/sold`): totals + a **per-price breakdown** in `lines[]`, one entry per price point — `unitPrice` (sotilgan narx), `costPrice` (olingan narx), `quantity`, `amount`, `profit`. Render it as a simple list: e.g. "7 000 so'm × 4", "10 000 so'm × 10", each with its cost and profit. This is exactly the "iPhone 11 chexol → 14 ta, ichида nechpuldan nechta sotilgani" view.
- Empty state when nothing has been sold yet.

### 7.4 New sale flow — central FAB (`＋ Sotuv`)
The most-used action; make it fast and delightful. First choose **Telefon** or **Aksessuar** (segmented control), then:

**Phone sale — `POST /sales/phone { phoneId, price, note?, debt? }`:**
- Pick an in-stock phone (searchable picker; if launched from a phone detail, pre-filled).
- Enter the negotiated **price** (`MoneyInput`). Optionally show the phone's `listPrice` as a hint (never as the label price).
- **Debt toggle** ("Qarzga berish"): reveals `amount`, `dueDate` (date picker, must be ≥ today), `customerName`, `customerPhone` (normalise to `998XXXXXXXXX`). Live-validate `amount > 0` and `amount ≤ price`; the app computes and shows `paid = price − amount`. Map `DEBT_EXCEEDS_TOTAL`, `DUE_DATE_IN_PAST`, `CUSTOMER_REQUIRED_FOR_DEBT`.
- On success: success animation, show the sale `code` (e.g. `S-000123`), offer "Yana sotuv" / "Kvitansiya".

**Accessory sale — `POST /sales/accessory { accessoryId, quantity, unitPrice?, note?, debt? }`:**
- Pick accessory, choose **quantity** (clamp to available; the picker shows stock). `unitPrice` defaults to the accessory's `salePrice` — if neither given, backend returns `PRICE_REQUIRED`, so require it in the form when there's no default.
- Same optional debt block. Handle `INSUFFICIENT_STOCK` (`details.available`).

### 7.5 Sales history — (under `Ko'proq`)
List: **`GET /sales?type&isDebt&from&to&search&page&limit`**.

- **Tabs by `type`**: **Telefonlar** (`?type=PHONE`) and **Aksessuarlar** (`?type=ACCESSORY`). Each sale row already embeds everything (no extra requests): product snapshot (name, imei, memory, image), `totalAmount`, `paidAmount`, `debtAmount`, `profit`, `status` (COMPLETED / PARTIALLY_RETURNED / RETURNED), and `debt` info if any. Render the whole tab from one request.
- **On every sold item — phone or accessory — show both the purchase price (olingan) and the sale price (sotilgan), and the profit**, so it's immediately clear what was earned. In sale line items these are `costPrice` (olingan) and `unitPrice` (sotilgan); compute/show profit per line and per sale.
- Filters: date range, `isDebt` toggle (faqat qarzli), search (code / product name / imei).
- **Sale detail** (`GET /sales/:id`): header (code, date, seller, status pill), line items (unitPrice, costPrice, lineTotal, returnedQuantity), profit, and debt block if present.
  - **Return** (`POST /sales/:id/return { saleItemId, quantity, amount?, reason }`): pick a line item, choose quantity (≤ sold − alreadyReturned; the API enforces it — clamp in UI and handle `RETURN_EXCEEDS_SOLD`), optional refund `amount` (defaults to proportional, may be lower not higher → handle `RETURN_AMOUNT_EXCEEDS_SOLD` using `details.maxAmount`), required `reason`. Explain the effects in plain Uzbek: phone returns to stock / accessory quantity restored; an open debt is reduced (and cancelled if it hits 0); sale status recomputes.
  - **Returns list** (`GET /sales/:id/returns`) shown in the detail.

### 7.6 Debts — `Qarzlar` (under `Ko'proq`)
The debtors page: **`GET /debts?status&overdue=true&from&to&search&page&limit`**. Default view = `?status=OPEN`.

- Each row already carries: `customerName`, `customerPhone`, `productName`, `saleTotalAmount`, `paidAmount`, `amount` (still owed), `dueDate`, `status`, and computed **`isOverdue` + `daysOverdue`** — render from one request.
- Highlight **overdue** rows in red with a "N kun kechikkan" badge. A quick filter for `overdue=true`. Search by name/phone.
- Tap-to-call the customer phone (`tel:`), and a WhatsApp/Telegram link is a nice touch (optional).
- **Pay** (`POST /debts/:id/pay { paidAt? }`) — a confirm sheet, optional settlement date (default today). Handle `DEBT_NOT_OPEN`. Optimistically move the row to PAID.
- **Extend / edit** (`PATCH /debts/:id { dueDate?, note? }`) — "Muddatni uzaytirish": new due date + note.
- No delete — a wrongly created debt is cleared by returning the sale (link the user to the underlying sale).

### 7.7 Expenses — `Xarajatlar` (under `Ko'proq`)
List: **`GET /expenses?from&to&search&page&limit`**. Plain CRUD.

- Add (`POST /expenses { amount, note, spentAt? }`) — amount + note required, date defaults to today.
- Edit (`PATCH /expenses/:id`), delete (`DELETE /expenses/:id`, soft, confirm).
- Show a range total (sum is available via statistics, but a simple client total of the fetched range is fine to display alongside).

### 7.8 Settings — `Sozlamalar` (under `Ko'proq`)
- **Shop profile** (`GET /shop`, `PATCH /shop { name, address?, phone?, labelFooter? }`) — the `name` and `labelFooter` are what print on phone labels; show a live label preview.
- **Account**: current user (`GET /auth/me`), change password (§5), logout.
- **Appearance**: dark-mode toggle, reduced-motion note.
- App version / about.

---

## 8. Formatting & helpers (build once, use everywhere)
- `formatMoney(n)` → `3 000 000 so'm`.
- `formatDate(d)` / `formatDateTime(d)` in Asia/Tashkent.
- `formatPhone('998901234567')` → `+998 90 123 45 67`; and `normalizePhone(input)` → `998XXXXXXXXX` for submits.
- `formatMemory(ram, storage)` → `8 GB / 256 GB` (mirror backend; backend also returns pre-formatted `memory` on sale rows & labels — prefer that when present).
- Status/condition → localized label + pill color maps.

---

## 9. Quality bar
- Fully typed; no `any` at API boundaries.
- Mobile-first, thumb-reachable, 44px targets, safe-area insets (notch), works one-handed.
- Fast: skeletons not spinners, cached queries, optimistic mutations where safe, debounced search.
- Accessible: focus states, labels, contrast in both themes, `prefers-reduced-motion`.
- Consistent: every screen uses the shared components and the error-code map; every list has loading/empty/error states.
- No dead features: only build what an endpoint backs.

---

## 10. Out of scope — do not build
Anything without a backing endpoint: staff accounts/roles, installment payments, a customer directory, payment methods, multi-currency, barcode scanning, notifications (SMS/Telegram), audit logs, server-side PDF (the label is a client-side print view only). Keep the structure clean so these could be added later, but write none of it now.

---

## 11. Build order
Separate steps, pause for review after each:

1. **Scaffold:** Vite + Vue 3 + TS + Tailwind + Pinia + Router + Vue Query + axios. Design tokens, dark mode, base components (`AppButton`, `AppInput`, `Card`, `Toast`, `EmptyState`, `Skeleton`). Generate/write API types from `openapi.json`.
2. **API + auth core:** axios instance with auth + refresh-rotation interceptor, session store, `GET /auth/me` hydrate, router guards, error-code map + toaster.
3. **App shell:** mobile bottom-nav + FAB, desktop sidebar, page-transition system, responsive layout.
4. **Auth screens:** login, register (auto-login), logout, change password.
5. **Phones:** list (search/filter/sort, infinite scroll; **optional IMEI** in the add form; **show olingan + sotilgan + foyda for sold phones**), create with image upload, detail, edit rules, delete, **label print view**.
6. **Accessories:** **Mavjud** + **Sotilgan** tabs. In-stock list, create, detail, edit, **add stock + stock history**; sold tab (`/accessories/sold`) with aggregated rows and the **per-price sold breakdown** (`/accessories/:id/sold`).
7. **Sales flow:** the central new-sale flow (phone + accessory) with the debt block and all its validations; success screen.
8. **Sales history:** tabbed list (by type), sale detail, **returns** flow + returns list.
9. **Debts:** debtors list (overdue highlighting), pay, extend.
10. **Expenses:** CRUD.
11. **Dashboard/statistics:** stat tiles with count-up, date-range picker, daily chart, debts summary.
12. **Settings:** shop profile + label preview, appearance, account. Polish pass: animations, empty/loading/error states, reduced-motion, dark-mode audit, mobile QA.
