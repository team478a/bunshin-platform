CREATE TYPE "VideoDisclosurePolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED');
CREATE TYPE "VideoDisclosurePlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'YOUTUBE_SHORTS');

CREATE TABLE "video_disclosure_policies" (
  "id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "platform" "VideoDisclosurePlatform" NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "VideoDisclosurePolicyStatus" NOT NULL DEFAULT 'DRAFT',
  "disclosure_text" VARCHAR(500) NOT NULL,
  "hashtags" JSONB NOT NULL DEFAULT '[]',
  "guidance" VARCHAR(1000) NOT NULL,
  "output_metadata" JSONB NOT NULL DEFAULT '{}',
  "change_reason" VARCHAR(1000) NOT NULL,
  "activation_reason" VARCHAR(1000),
  "created_by_user_id" UUID NOT NULL,
  "activated_by_user_id" UUID,
  "activated_at" TIMESTAMPTZ(6),
  "superseded_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "video_disclosure_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "video_disclosure_policies_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "video_disclosure_policies_activated_by_user_id_fkey"
    FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "video_disclosure_policies_environment_platform_version_key"
  ON "video_disclosure_policies"("environment", "platform", "version");
CREATE UNIQUE INDEX "video_disclosure_policies_one_active_per_environment_platform"
  ON "video_disclosure_policies"("environment", "platform") WHERE "status" = 'ACTIVE';
CREATE INDEX "video_disclosure_policies_environment_platform_status_created_at_idx"
  ON "video_disclosure_policies"("environment", "platform", "status", "created_at");
