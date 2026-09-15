-- 012_add_cloudinary_to_work_attachments.sql
-- Chuyen luu tru file dinh kem tu disk sang Cloudinary.
-- "file_path" tu day se luu secure_url tra ve tu Cloudinary.

ALTER TABLE "work_attachments" ADD COLUMN IF NOT EXISTS "public_id" VARCHAR(255);
ALTER TABLE "work_attachments" ADD COLUMN IF NOT EXISTS "resource_type" VARCHAR(50);
