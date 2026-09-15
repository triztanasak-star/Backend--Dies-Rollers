-- 002_create_projects.sql
-- Bang moi: projects. Manager/Admin tao va quan ly, digital_works se tro ve day qua project_id.

CREATE TABLE IF NOT EXISTS "projects" (
  "id"            SERIAL PRIMARY KEY,
  "project_name"  VARCHAR(255) NOT NULL,
  "description"   TEXT,
  "manager_id"    INTEGER REFERENCES "users"("id"),
  "status"        VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK ("status" IN ('active', 'completed', 'cancelled')),
  "is_deleted"    BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_projects_manager_id" ON "projects" ("manager_id");
