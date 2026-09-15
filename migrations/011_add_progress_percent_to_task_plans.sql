-- 010_add_progress_percent_to_task_plans.sql
-- Moi hang muc (task_plan) co % tien do rieng; digital_works.progress_percent se duoc
-- backend tu tinh lai = trung binh cac hang muc (xem taskPlans.routes.js).

ALTER TABLE "task_plans"
  ADD COLUMN IF NOT EXISTS "progress_percent" INTEGER NOT NULL DEFAULT 0
    CHECK ("progress_percent" BETWEEN 0 AND 100);
