CREATE TYPE "VideoRenderStatus" AS ENUM ('QUEUED', 'SUBMITTED', 'RENDERING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TABLE "video_renders" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "video_project_id" UUID NOT NULL,
  "project_revision" INTEGER NOT NULL,
  "provider" VARCHAR(80) NOT NULL,
  "status" "VideoRenderStatus" NOT NULL DEFAULT 'QUEUED',
  "external_job_id" VARCHAR(255),
  "output_storage_key" VARCHAR(512),
  "error_code" VARCHAR(80),
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "video_renders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "video_renders_project_fkey" FOREIGN KEY ("workspace_id", "video_project_id") REFERENCES "video_projects"("workspace_id", "id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "video_renders_project_revision_key" ON "video_renders"("video_project_id", "project_revision");
CREATE INDEX "video_renders_workspace_owner_status_created_idx" ON "video_renders"("workspace_id", "owner_user_id", "status", "created_at");
CREATE INDEX "video_renders_group_membership_status_idx" ON "video_renders"("group_id", "group_membership_id", "status");
CREATE INDEX "video_renders_provider_external_job_idx" ON "video_renders"("provider", "external_job_id");
