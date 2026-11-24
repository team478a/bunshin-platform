ALTER TABLE "browser_fixture_materials"
  ADD COLUMN "imported_by" UUID,
  ADD COLUMN "imported_at" TIMESTAMPTZ(6),
  ADD COLUMN "import_digest" CHAR(64),
  ALTER COLUMN "verified_at" DROP NOT NULL,
  ALTER COLUMN "source_job_id" DROP NOT NULL,
  ALTER COLUMN "source_attempt" DROP NOT NULL,
  DROP CONSTRAINT "browser_fixture_materials_origin_check",
  ADD CONSTRAINT "browser_fixture_materials_import_membership_fkey"
    FOREIGN KEY ("workspace_id", "imported_by")
    REFERENCES "workspace_memberships" ("workspace_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "browser_fixture_materials_origin_check" CHECK (
    (
      "imported_by" IS NULL AND "imported_at" IS NULL AND "import_digest" IS NULL
      AND "verified_at" IS NOT NULL AND "source_job_id" IS NOT NULL AND "source_attempt" IS NOT NULL
      AND (
        ("recipe_id" IS NOT NULL AND "workspace_id" IS NULL AND "group_id" IS NULL
          AND "program_id" IS NULL AND "fixture_device" IS NULL)
        OR
        ("recipe_id" IS NULL AND "workspace_id" IS NOT NULL AND "group_id" IS NOT NULL
          AND "program_id" IS NOT NULL AND "fixture_device" IS NOT NULL
          AND "fixture_device" IN ('desktop', 'mobile'))
      )
    )
    OR
    (
      "recipe_id" IS NULL AND "workspace_id" IS NOT NULL AND "group_id" IS NULL AND "program_id" IS NULL
      AND "fixture_device" IS NOT NULL AND "fixture_device" IN ('desktop', 'mobile')
      AND "imported_by" IS NOT NULL AND "imported_at" IS NOT NULL AND "import_digest" IS NOT NULL
      AND "verified_at" IS NULL AND "source_job_id" IS NULL AND "source_attempt" IS NULL
    )
  );

CREATE UNIQUE INDEX "browser_fixture_materials_import_key"
  ON "browser_fixture_materials" ("workspace_id", "imported_by", "fixture_device", "import_digest");

ALTER TABLE "browser_fixture_material_steps"
  ALTER COLUMN "before_image" DROP NOT NULL,
  ALTER COLUMN "after_image" DROP NOT NULL;
