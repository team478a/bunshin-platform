CREATE TYPE "VideoAssetKind" AS ENUM ('IMAGE', 'VIDEO', 'LOGO');
CREATE TYPE "VideoAssetStatus" AS ENUM ('PENDING_UPLOAD', 'READY', 'REJECTED', 'DELETED');

CREATE TABLE "video_assets" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "video_project_id" UUID,
  "kind" "VideoAssetKind" NOT NULL,
  "status" "VideoAssetStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
  "storage_key" VARCHAR(512) NOT NULL,
  "original_filename" VARCHAR(255) NOT NULL,
  "declared_mime_type" VARCHAR(100) NOT NULL,
  "verified_mime_type" VARCHAR(100),
  "declared_size_bytes" INTEGER NOT NULL,
  "verified_size_bytes" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "duration_ms" INTEGER,
  "rights_confirmed_at" TIMESTAMPTZ(6) NOT NULL,
  "usage_terms" VARCHAR(1000),
  "failure_code" VARCHAR(80),
  "expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "video_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "video_assets_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "video_assets_group_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE,
  CONSTRAINT "video_assets_membership_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id") ON DELETE CASCADE,
  CONSTRAINT "video_assets_owner_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "video_assets_project_fkey" FOREIGN KEY ("video_project_id") REFERENCES "video_projects"("id") ON DELETE SET NULL,
  CONSTRAINT "video_assets_declared_size_check" CHECK ("declared_size_bytes" > 0 AND "declared_size_bytes" <= 200000000),
  CONSTRAINT "video_assets_verified_size_check" CHECK ("verified_size_bytes" IS NULL OR "verified_size_bytes" > 0),
  CONSTRAINT "video_assets_dimensions_check" CHECK (("width" IS NULL AND "height" IS NULL) OR ("width" > 0 AND "height" > 0)),
  CONSTRAINT "video_assets_duration_check" CHECK ("duration_ms" IS NULL OR ("duration_ms" > 0 AND "duration_ms" <= 120000))
);

CREATE UNIQUE INDEX "video_assets_storage_key_key" ON "video_assets"("storage_key");
CREATE UNIQUE INDEX "video_assets_workspace_id_id_key" ON "video_assets"("workspace_id", "id");
CREATE INDEX "video_assets_workspace_owner_status_created_idx" ON "video_assets"("workspace_id", "owner_user_id", "status", "created_at");
CREATE INDEX "video_assets_group_membership_status_idx" ON "video_assets"("group_id", "group_membership_id", "status");
CREATE INDEX "video_assets_project_status_idx" ON "video_assets"("video_project_id", "status");
