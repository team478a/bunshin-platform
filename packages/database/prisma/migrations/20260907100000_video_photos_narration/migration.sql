ALTER TABLE "video_projects" ADD COLUMN "photo_asset_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[], ADD COLUMN "narration_enabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "video_narrations" (
  "id" UUID NOT NULL, "render_id" UUID NOT NULL, "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL, "owner_user_id" UUID NOT NULL, "status" VARCHAR(20) NOT NULL,
  "text_hash" CHAR(64) NOT NULL, "model" VARCHAR(80) NOT NULL, "prompt_version" VARCHAR(80) NOT NULL,
  "voice" VARCHAR(40) NOT NULL, "attempt_count" INTEGER NOT NULL DEFAULT 1,
  "attempted_characters" INTEGER NOT NULL DEFAULT 0,
  "estimated_cost_usd_micros" INTEGER NOT NULL DEFAULT 0, "latency_ms" INTEGER,
  "storage_key" VARCHAR(512), "error_code" VARCHAR(100), "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "video_narrations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "video_narrations_status_check" CHECK ("status" IN ('PROCESSING','READY','FAILED','DELETED'))
);
CREATE UNIQUE INDEX "video_narrations_render_id_key" ON "video_narrations"("render_id");
CREATE INDEX "video_narrations_owner_user_id_deleted_at_idx" ON "video_narrations"("owner_user_id", "deleted_at");
CREATE INDEX "video_narrations_expires_at_deleted_at_idx" ON "video_narrations"("expires_at", "deleted_at");
