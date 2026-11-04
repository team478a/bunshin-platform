ALTER TYPE "PostSource" ADD VALUE IF NOT EXISTS 'OFFICIAL_API';

CREATE TABLE "social_publication_intents" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "social_profile_id" UUID NOT NULL,
  "daily_mission_id" UUID NOT NULL,
  "content_variant_id" UUID NOT NULL,
  "content_revision" INTEGER NOT NULL,
  "connection_id" UUID NOT NULL,
  "media_id" UUID NOT NULL,
  "media_content_hash" CHAR(64) NOT NULL,
  "platform" VARCHAR(40) NOT NULL,
  "caption" VARCHAR(2200) NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "approval_hash" CHAR(64) NOT NULL,
  "approved_by_user_id" UUID NOT NULL,
  "approved_at" TIMESTAMPTZ(6) NOT NULL,
  "approval_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
  "container_id" VARCHAR(255),
  "external_post_id" VARCHAR(255),
  "failure_category" VARCHAR(80),
  "last_attempt_at" TIMESTAMPTZ(6),
  "published_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "social_publication_intents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_publication_intents_content_revision_check" CHECK ("content_revision" > 0),
  CONSTRAINT "social_publication_intents_platform_check" CHECK ("platform" = 'INSTAGRAM'),
  CONSTRAINT "social_publication_intents_status_check" CHECK ("status" IN ('APPROVED', 'PROCESSING', 'UNKNOWN', 'PUBLISHED', 'FAILED')),
  CONSTRAINT "social_publication_intents_membership_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "owner_user_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "social_publication_intents_bunshin_fkey" FOREIGN KEY ("workspace_id", "group_id", "owner_user_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "group_id", "owner_user_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "social_publication_intents_profile_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "social_profile_id") REFERENCES "social_profiles"("workspace_id", "bunshin_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "social_publication_intents_mission_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "social_publication_intents_variant_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id", "content_variant_id") REFERENCES "mission_content_variants"("workspace_id", "bunshin_id", "daily_mission_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "social_publication_intents_connection_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "owner_user_id", "connection_id") REFERENCES "social_account_connections"("workspace_id", "group_id", "group_membership_id", "user_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "social_publication_intents_media_fkey" FOREIGN KEY ("workspace_id", "media_id") REFERENCES "social_image_generated_media"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "social_publication_intents_approver_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "social_publication_intents_mission_key" ON "social_publication_intents"("workspace_id", "bunshin_id", "daily_mission_id");
CREATE UNIQUE INDEX "social_publication_intents_idempotency_key" ON "social_publication_intents"("workspace_id", "group_id", "owner_user_id", "idempotency_key");
CREATE INDEX "social_publication_intents_owner_status_idx" ON "social_publication_intents"("workspace_id", "group_id", "owner_user_id", "bunshin_id", "status", "scheduled_at");
CREATE INDEX "social_publication_intents_connection_idx" ON "social_publication_intents"("connection_id", "status");

ALTER TABLE "social_publication_intents" ENABLE ROW LEVEL SECURITY;
