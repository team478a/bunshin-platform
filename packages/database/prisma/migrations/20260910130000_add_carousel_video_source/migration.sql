ALTER TABLE "video_projects"
  ADD COLUMN "social_image_generation_request_id" UUID,
  ADD COLUMN "review_decision" VARCHAR(16),
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "video_projects_social_image_generation_request_id_key"
  ON "video_projects"("social_image_generation_request_id");

ALTER TABLE "video_projects"
  ADD CONSTRAINT "video_projects_social_image_generation_request_id_fkey"
  FOREIGN KEY ("social_image_generation_request_id")
  REFERENCES "social_image_generation_requests"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "video_projects"
  ADD CONSTRAINT "video_projects_review_decision_check"
  CHECK (
    ("review_decision" IS NULL AND "reviewed_at" IS NULL)
    OR ("review_decision" IN ('ADOPTED', 'REJECTED') AND "reviewed_at" IS NOT NULL)
  );
