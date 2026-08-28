CREATE TYPE "SocialImageGenerationPilotStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'SUPERSEDED');
CREATE TYPE "SocialImagePilotEnrollmentStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "SocialImageGenerationRequestStatus" AS ENUM (
  'DRAFT', 'QUEUED', 'GENERATING_ASSET', 'COMPOSING', 'READY_FOR_REVIEW', 'FAILED', 'CANCELLED'
);
CREATE TYPE "SocialImageGeneratedMediaStatus" AS ENUM ('READY', 'ADOPTED', 'REJECTED', 'DELETED');

CREATE UNIQUE INDEX "campaigns_workspace_id_group_id_id_key"
  ON "campaigns"("workspace_id", "group_id", "id");
CREATE UNIQUE INDEX "generation_context_snapshots_workspace_id_bunshin_id_id_key"
  ON "generation_context_snapshots"("workspace_id", "bunshin_id", "id");
CREATE UNIQUE INDEX "group_memberships_workspace_group_id_user_key"
  ON "group_memberships"("workspace_id", "group_id", "id", "user_id");
CREATE UNIQUE INDEX "groups_workspace_id_id_key"
  ON "groups"("workspace_id", "id");

CREATE TABLE "social_image_generation_pilots" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "SocialImageGenerationPilotStatus" NOT NULL DEFAULT 'DRAFT',
  "starts_at" TIMESTAMPTZ(6),
  "ends_at" TIMESTAMPTZ(6),
  "daily_limit" INTEGER NOT NULL,
  "monthly_limit" INTEGER NOT NULL,
  "member_monthly_limit" INTEGER NOT NULL,
  "default_model" VARCHAR(120) NOT NULL,
  "default_quality" VARCHAR(40) NOT NULL,
  "emergency_stop" BOOLEAN NOT NULL DEFAULT false,
  "change_reason" VARCHAR(1000) NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "social_image_generation_pilots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_image_pilots_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "social_image_pilots_group_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE,
  CONSTRAINT "social_image_pilots_created_by_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "social_image_pilots_updated_by_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "social_image_pilots_limits_check" CHECK (
    "daily_limit" > 0 AND "monthly_limit" > 0 AND "member_monthly_limit" > 0
    AND "member_monthly_limit" <= "monthly_limit"
  ),
  CONSTRAINT "social_image_pilots_period_check" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at"),
  CONSTRAINT "social_image_pilots_version_check" CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX "social_image_pilots_workspace_group_id_key"
  ON "social_image_generation_pilots"("workspace_id", "group_id", "id");
CREATE UNIQUE INDEX "social_image_pilots_group_version_key"
  ON "social_image_generation_pilots"("group_id", "version");
CREATE UNIQUE INDEX "social_image_pilots_one_active_per_group_key"
  ON "social_image_generation_pilots"("group_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "social_image_pilots_workspace_group_status_created_idx"
  ON "social_image_generation_pilots"("workspace_id", "group_id", "status", "created_at");

CREATE TABLE "social_image_pilot_enrollments" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "pilot_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "status" "SocialImagePilotEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "consented_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "social_image_pilot_enrollments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_image_enrollments_pilot_fkey" FOREIGN KEY ("workspace_id", "group_id", "pilot_id") REFERENCES "social_image_generation_pilots"("workspace_id", "group_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "social_image_enrollments_membership_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "social_image_enrollments_revocation_check" CHECK (
    ("status" = 'ACTIVE' AND "revoked_at" IS NULL)
    OR ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "social_image_enrollments_workspace_group_id_key"
  ON "social_image_pilot_enrollments"("workspace_id", "group_id", "id");
CREATE UNIQUE INDEX "social_image_enrollments_scope_membership_key"
  ON "social_image_pilot_enrollments"("workspace_id", "group_id", "id", "group_membership_id");
CREATE UNIQUE INDEX "social_image_enrollments_pilot_membership_key"
  ON "social_image_pilot_enrollments"("pilot_id", "group_membership_id");
CREATE INDEX "social_image_enrollments_scope_status_idx"
  ON "social_image_pilot_enrollments"("workspace_id", "group_id", "group_membership_id", "status");

CREATE TABLE "social_image_generation_requests" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "daily_mission_id" UUID NOT NULL,
  "campaign_id" UUID,
  "product_pack_version_id" UUID,
  "generation_context_snapshot_id" UUID,
  "pilot_enrollment_id" UUID NOT NULL,
  "status" "SocialImageGenerationRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "template_key" VARCHAR(80) NOT NULL,
  "layout" JSONB NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "error_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "social_image_generation_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_image_requests_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "social_image_requests_group_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE,
  CONSTRAINT "social_image_requests_membership_owner_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "owner_user_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE RESTRICT,
  CONSTRAINT "social_image_requests_owner_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "social_image_requests_bunshin_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "social_image_requests_mission_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "social_image_requests_campaign_fkey" FOREIGN KEY ("workspace_id", "group_id", "campaign_id") REFERENCES "campaigns"("workspace_id", "group_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "social_image_requests_product_version_fkey" FOREIGN KEY ("product_pack_version_id") REFERENCES "product_pack_versions"("id") ON DELETE RESTRICT,
  CONSTRAINT "social_image_requests_context_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "generation_context_snapshot_id") REFERENCES "generation_context_snapshots"("workspace_id", "bunshin_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "social_image_requests_enrollment_fkey" FOREIGN KEY ("workspace_id", "group_id", "pilot_enrollment_id", "group_membership_id") REFERENCES "social_image_pilot_enrollments"("workspace_id", "group_id", "id", "group_membership_id") ON DELETE RESTRICT,
  CONSTRAINT "social_image_requests_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "social_image_requests_template_check" CHECK ("template_key" IN ('PERSON_HEADLINE', 'PROBLEM_CHECKLIST', 'THREE_POINTS', 'EMPATHY_QUOTE', 'CTA')),
  CONSTRAINT "social_image_requests_error_check" CHECK (("status" = 'FAILED') = ("error_code" IS NOT NULL))
);

CREATE UNIQUE INDEX "social_image_requests_workspace_id_key"
  ON "social_image_generation_requests"("workspace_id", "id");
CREATE UNIQUE INDEX "social_image_requests_media_scope_key"
  ON "social_image_generation_requests"("workspace_id", "group_id", "id", "owner_user_id", "daily_mission_id");
CREATE UNIQUE INDEX "social_image_requests_group_owner_idempotency_key"
  ON "social_image_generation_requests"("workspace_id", "group_id", "owner_user_id", "idempotency_key");
CREATE UNIQUE INDEX "social_image_requests_one_processing_per_mission_key"
  ON "social_image_generation_requests"("workspace_id", "bunshin_id", "daily_mission_id")
  WHERE "status" IN ('DRAFT', 'QUEUED', 'GENERATING_ASSET', 'COMPOSING');
CREATE INDEX "social_image_requests_owner_status_updated_idx"
  ON "social_image_generation_requests"("workspace_id", "group_id", "owner_user_id", "status", "updated_at");
CREATE INDEX "social_image_requests_mission_status_idx"
  ON "social_image_generation_requests"("daily_mission_id", "status");
CREATE INDEX "social_image_requests_enrollment_status_idx"
  ON "social_image_generation_requests"("pilot_enrollment_id", "status");

CREATE TABLE "social_image_generated_media" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "daily_mission_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "status" "SocialImageGeneratedMediaStatus" NOT NULL DEFAULT 'READY',
  "source_storage_key" VARCHAR(512),
  "completed_storage_key" VARCHAR(512) NOT NULL,
  "thumbnail_storage_key" VARCHAR(512) NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "content_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "social_image_generated_media_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_image_media_request_fkey" FOREIGN KEY ("workspace_id", "group_id", "request_id", "owner_user_id", "daily_mission_id") REFERENCES "social_image_generation_requests"("workspace_id", "group_id", "id", "owner_user_id", "daily_mission_id") ON DELETE CASCADE,
  CONSTRAINT "social_image_media_owner_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "social_image_media_dimensions_check" CHECK ("width" = 1080 AND "height" = 1350),
  CONSTRAINT "social_image_media_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "social_image_media_workspace_id_key"
  ON "social_image_generated_media"("workspace_id", "id");
CREATE UNIQUE INDEX "social_image_media_completed_storage_key_key"
  ON "social_image_generated_media"("completed_storage_key");
CREATE UNIQUE INDEX "social_image_media_thumbnail_storage_key_key"
  ON "social_image_generated_media"("thumbnail_storage_key");
CREATE UNIQUE INDEX "social_image_media_one_adopted_per_mission_key"
  ON "social_image_generated_media"("workspace_id", "daily_mission_id") WHERE "status" = 'ADOPTED';
CREATE INDEX "social_image_media_owner_status_created_idx"
  ON "social_image_generated_media"("workspace_id", "group_id", "owner_user_id", "status", "created_at");
CREATE INDEX "social_image_media_mission_status_idx"
  ON "social_image_generated_media"("daily_mission_id", "status");
CREATE INDEX "social_image_media_request_status_idx"
  ON "social_image_generated_media"("request_id", "status");
