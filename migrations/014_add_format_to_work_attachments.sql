-- 013_add_format_to_work_attachments.sql
-- Luu format Cloudinary tra ve (vd: pdf, png, jpg) de dung khi tao signed URL tai file.

ALTER TABLE "work_attachments" ADD COLUMN IF NOT EXISTS "format" VARCHAR(20);
