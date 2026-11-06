# Claude uchun production bazani o'qish

Claude Code bazaga faqat o'qiy oladigan `claude_ro` foydalanuvchisi bilan, SSH tunnel orqali ulanadi. Serverga yangi kod yoki ochiq port qo'shilmaydi.

```text
Claude Code -> lokal postgres-mcp -> SSH tunnel -> server Postgres (claude_ro)
```

`claude_ro` barcha biznes jadvallarni o'qiydi. U `refresh_tokens` jadvalini va `users.password_hash` ustunini o'qiy olmaydi, hech narsani o'zgartira olmaydi.

## 1. Serverda portni tekshirish

```bash
sudo ss -tlnp | grep 5432
docker ps --filter name=shop_postgres --format '{{.Ports}}'
```

Agar `0.0.0.0:5432` ko'rinsa, Postgres internetga ochiq bo'lishi mumkin. Docker orqali ochilgan port `ufw` qoidalarini aylanib o'tishi mumkin. Bu holatda `docker-compose.yml` dagi portni shunday o'zgartiring:

```yaml
ports:
  - '127.0.0.1:${DB_PORT:-5432}:5432'
```

So'ng `docker compose up -d postgres` bilan konteynerni qayta yarating. Ilova va tunnel `127.0.0.1` orqali ishlashda davom etadi.

## 2. `claude_ro` foydalanuvchisini yaratish

Skriptni superuser nomidan ishga tushiring. Avval `scripts/claude-readonly-role.sql` faylini serverga ko'chiring yoki deploy qiling.

Docker bilan:

```bash
docker exec -i shop_postgres psql -U <DB_USER> -d <DB_NAME> < scripts/claude-readonly-role.sql
docker exec -it shop_postgres psql -U <DB_USER> -d <DB_NAME> -c '\password claude_ro'
```

Docker'siz:

```bash
sudo -u postgres psql -d <DB_NAME> -f scripts/claude-readonly-role.sql
sudo -u postgres psql -d <DB_NAME> -c '\password claude_ro'
```

Parolni `openssl rand -hex 24` bilan yarating. Unda URI'ni buzadigan belgilar bo'lmaydi.

Yangi jadval qo'shadigan migratsiyadan keyin skriptni qayta ishga tushiring. Yangi jadvalda maxfiy ustun bo'lsa, avval skriptda uni yoping.

## 3. Kompyuterda tunnel ochish

```bash
ssh -N -L 15432:127.0.0.1:<DB_PORT> <user>@<server>
```

Ishlab bo'lgach, tunnelni yoping. Tunnel yopilganda Claude bazaga ulana olmaydi.

## 4. MCP'ni ulash

`uv` o'rnatilgan bo'lishi kerak.

```bash
read -s "PW?claude_ro paroli: "; echo
claude mcp add prod-db --scope local --transport stdio \
  --env DATABASE_URI="postgresql://claude_ro:$PW@localhost:15432/<DB_NAME>" \
  -- uvx postgres-mcp==0.3.0 --access-mode=restricted
unset PW
```

`--scope local` sozlamani repoga emas, shaxsiy `~/.claude.json` fayliga yozadi. Parol u yerda ochiq matn bo'lib turadi.

## 5. Tekshirish

Claude Code'da `/mcp` buyrug'i bilan `prod-db` ulanganini ko'ring, keyin so'rang:

- `users jadvalidan password_hash ni o'qib ko'r` — xato qaytishi kerak.
- `shops jadvalidan do'konlar sonini ayt` — javob qaytishi kerak.

## Kirishni bekor qilish

```bash
claude mcp remove prod-db --scope local
```

Serverda:

```sql
ALTER ROLE claude_ro NOLOGIN;
```

## Bazadan nimalarni bilib bo'ladi

| Savol | Javob manbasi |
| --- | --- |
| Qaysi do'kon, qachon, nimani sotgan | `sales`, `sale_items`, `shops`, `phones`, `accessories` |
| Kim sotgan, kimga sotilgan | `sales.sold_by`, `customer_name`, `customer_phone` |
| Tannarx va foyda | `sale_items.cost_price`, `unit_price` |
| Qaytarishlar | `sale_returns` |
| Qarz to'lovlari | `debts`, `debt_payments` |
| Kirim va qoldiq partiyalar | `stock_receipts`, `accessory_stock_entries` |
| Kim, qachon, nimani o'zgartirgan yoki o'chirgan | `audit_log` |

## `audit_log`

Trigger'lar biznes jadvallaridagi har bir o'zgarishni yozadi, qo'lda bajarilgan SQL ham shunga kiradi.

| Ustun | Ma'nosi |
| --- | --- |
| `occurred_at` | O'zgarish vaqti |
| `shop_id`, `table_name`, `row_id` | Qaysi do'kon, jadval va qator |
| `action` | `INSERT`, `UPDATE` yoki `DELETE`. Soft delete `UPDATE` bo'lib, `deleted_at` o'zgaradi |
| `old_data`, `new_data` | `UPDATE` da faqat o'zgargan ustunlar, `INSERT` va `DELETE` da butun qator |
| `actor_id` | `users.id`. Kirish talab qilmaydigan so'rovda (`register`) va qo'lda SQL'da bo'sh |
| `request_id` | PM2 logidagi so'rov ID'si |
| `transaction_id` | Bitta amal bilan yozilgan qatorlarni guruhlaydi |
| `db_user` | Postgres foydalanuvchisi. Qo'lda SQL'ni ajratishga yordam beradi |

Masalan, bitta sotuvning tarixi:

```sql
SELECT occurred_at, table_name, action, old_data, new_data, actor_id
FROM audit_log
WHERE transaction_id = (
  SELECT transaction_id FROM audit_log
  WHERE table_name = 'sales' AND row_id = '<sale_id>' AND action = 'INSERT'
)
ORDER BY id;
```

`users.password_hash` qiymati yozilmaydi, faqat `[hidden]` bilan o'zgargani ko'rinadi. `refresh_tokens` va hisoblagich jadvallari yozilmaydi.

Jadval avtomatik tozalanmaydi va o'chirilgan mijoz ma'lumotlari ham unda qoladi. Hajmini vaqti-vaqti bilan tekshirib turing:

```sql
SELECT pg_size_pretty(pg_total_relation_size('audit_log'));
```

## Bazadan bilib bo'lmaydigan narsalar

- **Migratsiyadan oldingi o'zgarishlar:** `audit_log` faqat `AuditLog` migratsiyasi ishlagandan keyingi o'zgarishlarni yozadi.
- **Xatolar va so'rovlar:** ular bazada emas, PM2 loglarida (`pm2 logs teldaftar`). Bu MCP loglarni o'qimaydi. Muvaffaqiyatsiz so'rov `audit_log` ga tushmaydi, chunki tranzaksiya bekor bo'ladi.
