ALTER TABLE "browser_fixture_materials"
  ADD COLUMN "semantic_digest" CHAR(64),
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(6),
  ADD COLUMN "review_requested_at" TIMESTAMPTZ(6);

CREATE INDEX "browser_fixture_materials_review_idx"
  ON "browser_fixture_materials" ("review_requested_at", "reviewed_at", "verified_at")
  WHERE "program_id" IS NOT NULL;
