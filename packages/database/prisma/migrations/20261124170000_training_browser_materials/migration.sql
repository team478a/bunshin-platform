ALTER TABLE "browser_fixture_materials"
  ALTER COLUMN "recipe_id" DROP NOT NULL,
  ADD COLUMN "workspace_id" UUID,
  ADD COLUMN "group_id" UUID,
  ADD COLUMN "program_id" UUID,
  ADD COLUMN "fixture_device" VARCHAR(16),
  ADD CONSTRAINT "browser_fixture_materials_origin_check" CHECK (
    ("recipe_id" IS NOT NULL AND "workspace_id" IS NULL AND "group_id" IS NULL
      AND "program_id" IS NULL AND "fixture_device" IS NULL)
    OR
    ("recipe_id" IS NULL AND "workspace_id" IS NOT NULL AND "group_id" IS NOT NULL
      AND "program_id" IS NOT NULL AND "fixture_device" IS NOT NULL
      AND "fixture_device" IN ('desktop', 'mobile'))
  ),
  ADD CONSTRAINT "browser_fixture_materials_program_fkey"
    FOREIGN KEY ("workspace_id", "group_id", "program_id")
    REFERENCES "service_programs" ("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "browser_fixture_materials_program_revision_key"
  ON "browser_fixture_materials" ("workspace_id", "group_id", "program_id", "fixture_device", "revision");
