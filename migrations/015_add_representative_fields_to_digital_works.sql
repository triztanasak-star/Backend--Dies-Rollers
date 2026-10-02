-- 015_add_representative_fields_to_digital_works.sql
-- Them thong tin nguoi dai dien du an: ten, email, so dien thoai.

ALTER TABLE "digital_works"
  ADD COLUMN IF NOT EXISTS "representative_name" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "representative_email" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "representative_phone" VARCHAR(50);
