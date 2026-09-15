-- 004_create_task_plans.sql
-- Bang moi: task_plans. User tu tao ke hoach thuc hien chi tiet cho 1 digital_work duoc giao.

CREATE TABLE IF NOT EXISTS "task_plans" (
  "id"          SERIAL PRIMARY KEY,
  "work_id"     INTEGER NOT NULL REFERENCES "digital_works"("id") ON DELETE CASCADE,
  "created_by"  INTEGER REFERENCES "users"("id"),
  "step_name"   VARCHAR(255) NOT NULL,
  "step_order"  INTEGER NOT NULL DEFAULT 0,
  "status"      VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK ("status" IN ('pending', 'in_progress', 'done')),
  "due_date"    DATE,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_task_plans_work_id" ON "task_plans" ("work_id");
