# Claude uchun production bazani o'qish

Claude ilovasi bazaga connector orqali ulanadi: `https://api.teldaftar.uz/mcp`. Claude bazaga faqat `claude_ro` foydalanuvchisi nomidan so'rov yuboradi va hech narsani o'zgartira olmaydi.

```text
Claude -> HTTPS + OAuth -> /mcp (NestJS) -> Postgres (claude_ro)
```

Kirish uchun alohida admin paroli ishlatiladi, do'kon loginlari ishlamaydi. Bu connector **barcha do'konlar** ma'lumotini ko'radi.

`claude_ro` `refresh_tokens`, `mcp_oauth_*` jadvallarini va `users.password_hash` ustunini o'qiy olmaydi.

Uchta vosita bor: `list_tables`, `describe_table` va `query`. `query` bitta `SELECT` yoki `VALUES` so'rovini bajaradi, 15 soniyada to'xtaydi va ko'pi bilan 1000 qator qaytaradi. So'rovlar matni `pm2 logs teldaftar` da ko'rinadi, natijalari yozilmaydi.

## Yoqish

`.env` sozlanmaguncha `/mcp` o'chiq turadi. Serverda ilova papkasida bajaring.

**1. `claude_ro` ni tayyorlash** (faqat bir marta):

```bash
sudo -u postgres psql -d <DB_NAME> < scripts/claude-readonly-role.sql
sudo -u postgres psql -d <DB_NAME> -c '\password claude_ro'
```

**2. Admin parolini yaratish.** Kamida 16 belgili yangi parol tanlang:

```bash
read -rs -p 'Admin parol: ' P; echo
HASH=$(printf %s "$P" | node -e "require('argon2').hash(require('fs').readFileSync(0,'utf8')).then(console.log)")
unset P
printf "MCP_ADMIN_PASSWORD_HASH='%s'\n" "$HASH" >> .env
unset HASH
```

**3. Qolgan sozlamalar:**

```bash
read -rs -p 'claude_ro paroli: ' P; echo
printf "MCP_PUBLIC_URL=https://api.teldaftar.uz/mcp\nMCP_DB_USER=claude_ro\nMCP_DB_PASSWORD='%s'\n" "$P" >> .env
unset P
pm2 reload teldaftar --update-env
```

**4. Tekshirish:**

```bash
curl -i https://api.teldaftar.uz/.well-known/oauth-protected-resource/mcp
curl -i -X POST https://api.teldaftar.uz/mcp
```

Birinchisi `200`, ikkinchisi `401` qaytarishi kerak. `404` chiqsa, `.env` va nginx'ni tekshiring: `/mcp`, `/authorize`, `/token`, `/register`, `/revoke`, `/mcp-login` va `/.well-known/` ilovaga yetib borishi kerak.

**5. Claude'ga qo'shish:** **Customize > Connectors > Add custom connector**. URL: `https://api.teldaftar.uz/mcp`. OAuth client so'ralsa, **Register automatically** ni tanlang. Ochilgan sahifaga admin parolini kiriting.

## Kirishni bekor qilish

Barcha ulanishlarni uzish:

```bash
sudo -u postgres psql -d <DB_NAME> -c 'DELETE FROM mcp_oauth_tokens;'
```

Admin parolini almashtirganda ham shu buyruqni bajaring: yangi parol mavjud tokenlarni bekor qilmaydi.

Endpoint'ni butunlay o'chirish uchun `.env` dan `MCP_*` qatorlarini olib tashlang va `pm2 reload teldaftar --update-env` qiling.

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
- **Xatolar va so'rovlar:** ular bazada emas, PM2 loglarida (`pm2 logs teldaftar`). Connector loglarni o'qimaydi. Muvaffaqiyatsiz so'rov `audit_log` ga tushmaydi, chunki tranzaksiya bekor bo'ladi.
