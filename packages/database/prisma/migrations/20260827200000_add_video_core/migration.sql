CREATE TYPE "VideoProjectType" AS ENUM ('EXPLAINER', 'PRODUCT_INTRODUCTION', 'PHOTO_SLIDESHOW');
CREATE TYPE "VideoProjectStatus" AS ENUM (
  'DRAFT', 'PLANNING', 'WAITING_APPROVAL', 'APPROVED', 'QUEUED', 'RENDERING',
  'QUALITY_CHECK', 'READY_FOR_REVIEW', 'REVISING', 'COMPLETED', 'FAILED', 'CANCELLED'
);
CREATE TYPE "VideoSceneVisualType" AS ENUM (
  'USER_ASSET', 'APPROVED_ASSET', 'STOCK_IMAGE', 'GENERATED_IMAGE', 'TEXT_MOTION', 'AI_VIDEO'
);
CREATE UNIQUE INDEX "group_memberships_workspace_id_group_id_id_key"
  ON "group_memberships"("workspace_id", "group_id", "id");

CREATE TABLE "video_projects" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "campaign_id" UUID,
  "title" VARCHAR(160) NOT NULL,
  "platform" "SocialPlatform" NOT NULL,
  "type" "VideoProjectType" NOT NULL,
  "duration_seconds" INTEGER NOT NULL,
  "status" "VideoProjectStatus" NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "ai_processing_types" JSONB NOT NULL DEFAULT '[]',
  "disclosure_snapshot" JSONB NOT NULL DEFAULT '{}',
  "standard_composition" BOOLEAN NOT NULL DEFAULT true,
  "ai_video_scene_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "video_projects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "video_projects_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "video_projects_group_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE,
  CONSTRAINT "video_projects_membership_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id") ON DELETE CASCADE,
  CONSTRAINT "video_projects_owner_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "video_projects_bunshin_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE CASCADE,
  CONSTRAINT "video_projects_campaign_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL,
  CONSTRAINT "video_projects_duration_check" CHECK ("duration_seconds" IN (30, 60)),
  CONSTRAINT "video_projects_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "video_projects_ai_video_count_check" CHECK ("ai_video_scene_count" >= 0),
  CONSTRAINT "video_projects_standard_composition_check" CHECK (NOT "standard_composition" OR "ai_video_scene_count" = 0)
);

CREATE UNIQUE INDEX "video_projects_workspace_id_id_key" ON "video_projects"("workspace_id", "id");
CREATE INDEX "video_projects_workspace_owner_status_updated_idx" ON "video_projects"("workspace_id", "owner_user_id", "status", "updated_at");
CREATE INDEX "video_projects_group_membership_status_idx" ON "video_projects"("group_id", "group_membership_id", "status");
CREATE INDEX "video_projects_campaign_id_idx" ON "video_projects"("campaign_id");

CREATE TABLE "video_scenes" (
  "id" UUID NOT NULL,
  "video_project_id" UUID NOT NULL,
  "scene_no" INTEGER NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  "narration" TEXT NOT NULL,
  "caption" VARCHAR(240) NOT NULL,
  "visual_type" "VideoSceneVisualType" NOT NULL,
  "visual_prompt" TEXT,
  "keywords" JSONB NOT NULL DEFAULT '[]',
  "ai_processing_types" JSONB NOT NULL DEFAULT '[]',
  "locked" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "video_scenes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "video_scenes_project_fkey" FOREIGN KEY ("video_project_id") REFERENCES "video_projects"("id") ON DELETE CASCADE,
  CONSTRAINT "video_scenes_number_check" CHECK ("scene_no" >= 1),
  CONSTRAINT "video_scenes_duration_check" CHECK ("duration_ms" BETWEEN 500 AND 60000),
  CONSTRAINT "video_scenes_revision_check" CHECK ("revision" >= 1)
);

CREATE UNIQUE INDEX "video_scenes_project_scene_no_key" ON "video_scenes"("video_project_id", "scene_no");
CREATE INDEX "video_scenes_project_locked_idx" ON "video_scenes"("video_project_id", "locked");

INSERT INTO "feature_definitions" ("key", "parent_key", "name", "description", "status", "created_at", "updated_at")
VALUES (
  'VIDEO_GENERATION', NULL, '動画作成', 'グループ参加者向けの縦型動画作成機能', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "status" = 'ACTIVE',
  "updated_at" = CURRENT_TIMESTAMP;
