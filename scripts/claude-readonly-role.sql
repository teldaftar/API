-- Claude MCP uchun faqat o'qiy oladigan `claude_ro` foydalanuvchisi.
--
-- Bazaning egasi (superuser yoki jadvallar egasi) nomidan ishga tushiriladi.
-- Qayta ishga tushirish xavfsiz: yangi migratsiyadan keyin yangi jadvallarga
-- ruxsat berish uchun shu skriptni yana ishga tushiring.
--
-- Skript parol o'rnatmaydi. Parolni alohida `\password claude_ro` bilan bering,
-- shunda u shell tarixiga va bu faylga tushmaydi.

\set ON_ERROR_STOP on

BEGIN;

SELECT 'CREATE ROLE claude_ro LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'claude_ro')
\gexec

ALTER ROLE claude_ro
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 3;

-- Bu sozlamalarni sessiya ichida o'zgartirish mumkin. Asosiy himoya pastdagi
-- SELECT ruxsatlari, bular esa qo'shimcha to'siq va qulaylik uchun.
ALTER ROLE claude_ro SET default_transaction_read_only = on;
ALTER ROLE claude_ro SET statement_timeout = '15s';
ALTER ROLE claude_ro SET idle_in_transaction_session_timeout = '60s';
-- Vaqtlar do'kon vaqti bilan ko'rinadi (UTC+5).
ALTER ROLE claude_ro SET timezone = 'Asia/Tashkent';

SELECT format('GRANT CONNECT ON DATABASE %I TO claude_ro', current_database())
\gexec

GRANT USAGE ON SCHEMA public TO claude_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO claude_ro;

-- Sessiya tokenlari tahlil uchun kerak emas: jadval butunlay yopiq.
REVOKE ALL ON refresh_tokens FROM claude_ro;

-- `users` faqat ruxsat etilgan ustunlar orqali ochiq, `password_hash` yopiq.
-- Yangi ustun bu ro'yxatga qo'shilmaguncha ko'rinmaydi.
REVOKE ALL ON users FROM claude_ro;
GRANT SELECT (id, shop_id, full_name, login, role, is_active, created_at, updated_at)
  ON users TO claude_ro;

COMMIT;
