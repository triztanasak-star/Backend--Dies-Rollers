-- 008_add_support_id_to_digital_works.sql
-- Them vai tro "Support" (FK users), tach biet voi assigned_to (Leader du an).

ALTER TABLE "digital_works"
  ADD COLUMN IF NOT EXISTS "support_id" INTEGER REFERENCES "users"("id");

CREATE INDEX IF NOT EXISTS "idx_digital_works_support_id" ON "digital_works" ("support_id");
