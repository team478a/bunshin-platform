CREATE TYPE "VideoSceneGenerationStatus" AS ENUM (
  'QUEUED',
  'SUBMITTED',
  'GENERATING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "video_scene_generations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "video_project_id" UUID NOT NULL,
  "video_scene_id" UUID NOT NULL,
  "project_revision" INTEGER NOT NULL,
  "scene_revision" INTEGER NOT NULL,
  "provider" VARCHAR(80) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "status" "VideoSceneGenerationStatus" NOT NULL DEFAULT 'QUEUED',
  "input_snapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "estimated_cost_usd_micros" INTEGER,
  "actual_cost_usd_micros" INTEGER,
  "external_job_id" VARCHAR(255),
  "output_storage_key" VARCHAR(512),
  "error_code" VARCHAR(80),
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "video_scene_generations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "video_scene_generations_workspace_id_video_project_id_fkey"
    FOREIGN KEY ("workspace_id", "video_project_id") REFERENCES "video_projects"("workspace_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "video_scene_generations_video_scene_id_fkey"
    FOREIGN KEY ("video_scene_id") REFERENCES "video_scenes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "video_scene_generations_video_project_id_project_revision_video_scene_id_scene_revision_provider_model_key"
  ON "video_scene_generations"("video_project_id", "project_revision", "video_scene_id", "scene_revision", "provider", "model");
CREATE INDEX "video_scene_generations_workspace_id_owner_user_id_status_created_at_idx"
  ON "video_scene_generations"("workspace_id", "owner_user_id", "status", "created_at");
CREATE INDEX "video_scene_generations_group_id_group_membership_id_status_idx"
  ON "video_scene_generations"("group_id", "group_membership_id", "status");
CREATE INDEX "video_scene_generations_provider_external_job_id_idx"
  ON "video_scene_generations"("provider", "external_job_id");
