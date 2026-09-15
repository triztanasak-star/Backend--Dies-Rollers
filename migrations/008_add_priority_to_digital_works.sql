-- 007_add_priority_to_digital_works.sql
-- Bo sung cot priority (uu tien) cho digital_works - khong co truong tuong duong nao san co.
-- An toan: ADD COLUMN co DEFAULT, khong mat du lieu cu.

ALTER TABLE "digital_works"
  ADD COLUMN IF NOT EXISTS "priority" VARCHAR(10) NOT NULL DEFAULT 'medium'
    CHECK ("priority" IN ('high', 'medium', 'low'));

CREATE INDEX IF NOT EXISTS "idx_digital_works_priority" ON "digital_works" ("priority");
