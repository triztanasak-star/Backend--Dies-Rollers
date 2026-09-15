-- 003_alter_digital_works.sql
-- Bo sung lien ket RBAC cho digital_works da ton tai (co du lieu thuc).
-- Chi ADD COLUMN (nullable), khong DROP/doi kieu cot cu -> khong mat du lieu.

ALTER TABLE "digital_works"
  ADD COLUMN IF NOT EXISTS "project_id"  INTEGER REFERENCES "projects"("id");

ALTER TABLE "digital_works"
  ADD COLUMN IF NOT EXISTS "assigned_to" INTEGER REFERENCES "users"("id");

ALTER TABLE "digital_works"
  ADD COLUMN IF NOT EXISTS "created_by"  INTEGER REFERENCES "users"("id");

-- Khong tai dung cot "status" (dang la INTEGER nghiep vu 0..n) cho soft delete.
ALTER TABLE "digital_works"
  ADD COLUMN IF NOT EXISTS "is_deleted"  BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "digital_works"
  ADD COLUMN IF NOT EXISTS "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Best-effort migrate du lieu cu: cot "assistant" (VARCHAR ten) -> assigned_to (FK users.id)
-- Chi khop khi ten trung chinh xac voi users.name. Ban ghi khong khop se giu assigned_to = NULL,
-- can ra soat thu cong (xem 999_smoke_test.sql).
UPDATE "digital_works" dw
SET "assigned_to" = u."id"
FROM "users" u
WHERE dw."assigned_to" IS NULL
  AND dw."assistant" IS NOT NULL
  AND u."name" = dw."assistant";

CREATE INDEX IF NOT EXISTS "idx_digital_works_project_id"  ON "digital_works" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_digital_works_assigned_to" ON "digital_works" ("assigned_to");
