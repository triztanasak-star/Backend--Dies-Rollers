-- 016_add_support_request_and_attachment_category.sql
-- Them truong "Thong tin can ho tro" cho digital_works va phan loai anh dinh kem (anh sau khi lam).

ALTER TABLE "digital_works"
  ADD COLUMN IF NOT EXISTS "support_request" TEXT;

ALTER TABLE "work_attachments"
  ADD COLUMN IF NOT EXISTS "category" VARCHAR(50) NOT NULL DEFAULT 'general';
