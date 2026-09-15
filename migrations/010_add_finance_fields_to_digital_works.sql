-- 009_add_finance_fields_to_digital_works.sql
-- 3 truong tai chinh cho Dashboard/Phan tich tai chinh - nhap tay, khong tu tinh cong thuc.

ALTER TABLE "digital_works"
  ADD COLUMN IF NOT EXISTS "capex_amount" NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS "estimated_saving_per_year" NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS "payback_years" NUMERIC(6,2);
