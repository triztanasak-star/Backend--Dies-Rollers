-- 011_create_work_attachments.sql
-- File PDF/anh dinh kem cho 1 digital_work (yeu cau cong viec).

CREATE TABLE IF NOT EXISTS "work_attachments" (
  "id"            SERIAL PRIMARY KEY,
  "work_id"       INTEGER NOT NULL REFERENCES "digital_works"("id") ON DELETE CASCADE,
  "file_path"     VARCHAR(500) NOT NULL,
  "original_name" VARCHAR(255) NOT NULL,
  "mime_type"     VARCHAR(100),
  "uploaded_by"   INTEGER REFERENCES "users"("id"),
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_work_attachments_work_id" ON "work_attachments" ("work_id");
