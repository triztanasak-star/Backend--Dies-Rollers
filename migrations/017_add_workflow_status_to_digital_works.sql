-- 017_add_workflow_status_to_digital_works.sql
-- Quy trinh trang thai dy an: requested (Yeu cau) -> approved (Da duyet) -> in_progress (Thuc hien) -> completed (Hoan thanh)

ALTER TABLE "digital_works"
  ADD COLUMN IF NOT EXISTS "workflow_status" VARCHAR(20) NOT NULL DEFAULT 'requested';

-- Backfill du lieu cu dua theo tien do/thong tin da co de trang thai hop ly hon mac dinh 'requested'
UPDATE "digital_works"
SET "workflow_status" = CASE
  WHEN progress_percent >= 100 THEN 'completed'
  WHEN progress_percent > 0 THEN 'in_progress'
  WHEN assigned_to IS NOT NULL OR support_id IS NOT NULL OR lead_project IS NOT NULL OR assistant IS NOT NULL THEN 'approved'
  ELSE 'requested'
END
WHERE "workflow_status" = 'requested';
