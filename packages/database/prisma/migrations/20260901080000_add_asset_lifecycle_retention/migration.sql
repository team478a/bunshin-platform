ALTER TABLE "video_renders"
  ADD COLUMN "expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

ALTER TABLE "video_assets"
  ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

ALTER TABLE "video_scene_generations"
  ADD COLUMN "expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

ALTER TABLE "social_image_generated_media"
  ADD COLUMN "expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

UPDATE "video_assets"
SET "expires_at" = "created_at" + INTERVAL '90 days'
WHERE "expires_at" IS NULL
  AND "status" IN ('PENDING_UPLOAD', 'READY');

UPDATE "video_renders"
SET "expires_at" = COALESCE("completed_at", "created_at") + INTERVAL '90 days'
WHERE "expires_at" IS NULL
  AND "status" = 'SUCCEEDED';

UPDATE "video_scene_generations"
SET "expires_at" = COALESCE("completed_at", "created_at") + INTERVAL '90 days'
WHERE "expires_at" IS NULL
  AND "status" = 'SUCCEEDED';

UPDATE "social_image_generated_media"
SET "expires_at" = "created_at" + INTERVAL '90 days'
WHERE "expires_at" IS NULL
  AND "status" IN ('READY', 'ADOPTED', 'REJECTED');

CREATE INDEX "video_renders_status_expires_at_idx"
  ON "video_renders"("status", "expires_at");

CREATE INDEX "video_assets_status_expires_at_idx"
  ON "video_assets"("status", "expires_at");

CREATE INDEX "video_scene_generations_status_expires_at_idx"
  ON "video_scene_generations"("status", "expires_at");

CREATE INDEX "social_image_generated_media_status_expires_at_idx"
  ON "social_image_generated_media"("status", "expires_at");
