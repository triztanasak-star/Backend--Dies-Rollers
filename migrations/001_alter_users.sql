-- 001_alter_users.sql
-- Bo sung cot xac thuc + trang thai cho bang users da ton tai.
-- An toan: chi ADD COLUMN, khong DROP/khong doi kieu cot cu, khong mat du lieu.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "password_hash" VARCHAR(255);

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'active';

-- role hien tai dang luu vai tro cong viec (VD: 'Manager', 'Assistant', 'Lead Project'),
-- khong phai cap quyen RBAC. Luu lai gia tri goc vao job_title truoc khi ghi de,
-- roi chuan hoa role ve dung 3 gia tri admin/manager/user theo mapping da chot voi user:
-- Manager -> manager, Lead Project -> manager, Assistant -> user.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "job_title" VARCHAR(100);

UPDATE "users"
SET "job_title" = COALESCE("job_title", "role")
WHERE "role" NOT IN ('admin', 'manager', 'user');

UPDATE "users"
SET "role" = CASE
  WHEN LOWER("role") IN ('manager', 'lead project') THEN 'manager'
  WHEN LOWER("role") IN ('assistant') THEN 'user'
  ELSE "role"
END
WHERE "role" NOT IN ('admin', 'manager', 'user');

-- Xoa rang buoc cu neu co truoc khi tao moi de tranh loi trung lap
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_check";
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('admin', 'manager', 'user'));

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_status_check";
ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK ("status" IN ('active', 'disabled'));

CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_email" ON "users" ("email");