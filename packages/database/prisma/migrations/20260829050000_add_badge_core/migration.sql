CREATE TYPE "BadgeOwnerType" AS ENUM ('SYSTEM', 'GROUP');
CREATE TYPE "BadgeDefinitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'SUSPENDED');
CREATE TYPE "BadgeConditionType" AS ENUM ('FIRST', 'COUNT', 'STREAK_DAILY', 'STREAK_WEEKLY', 'WINDOW', 'COMPOSITE', 'DISTINCT', 'MANUAL_APPROVAL', 'IMPORT');
CREATE TYPE "BadgeVisibilityPolicy" AS ENUM ('PRIVATE', 'GROUP');
CREATE TYPE "BadgeProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ELIGIBLE', 'AWARDED');
CREATE TYPE "BadgeAwardStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE "BadgeProcessingStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "badge_definitions" (
  "id" UUID NOT NULL,
  "owner_type" "BadgeOwnerType" NOT NULL,
  "workspace_id" UUID,
  "group_id" UUID,
  "code" VARCHAR(100) NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "status" "BadgeDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
  "current_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "badge_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badge_definitions_owner_scope_check" CHECK (("owner_type" = 'SYSTEM' AND "workspace_id" IS NULL AND "group_id" IS NULL) OR ("owner_type" = 'GROUP' AND "workspace_id" IS NOT NULL AND "group_id" IS NOT NULL)),
  CONSTRAINT "badge_definitions_version_check" CHECK ("current_version" >= 0)
);

CREATE TABLE "badge_versions" (
  "id" UUID NOT NULL,
  "definition_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "image_key" VARCHAR(255) NOT NULL,
  "locked_image_key" VARCHAR(255),
  "alt_text" VARCHAR(200) NOT NULL,
  "background_color" VARCHAR(20),
  "condition_type" "BadgeConditionType" NOT NULL,
  "condition_config" JSONB NOT NULL,
  "visibility_policy" "BadgeVisibilityPolicy" NOT NULL DEFAULT 'PRIVATE',
  "reward_policy" JSONB NOT NULL,
  "starts_at" TIMESTAMPTZ(6),
  "ends_at" TIMESTAMPTZ(6),
  "published_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "badge_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badge_versions_values_check" CHECK ("version" > 0 AND ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" > "starts_at"))
);

CREATE TABLE "badge_progress" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "badge_version_id" UUID NOT NULL,
  "group_id" UUID,
  "current_value" INTEGER NOT NULL DEFAULT 0,
  "target_value" INTEGER NOT NULL,
  "streak_state" JSONB,
  "status" "BadgeProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "last_event_at" TIMESTAMPTZ(6),
  "revision" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "badge_progress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badge_progress_values_check" CHECK ("current_value" >= 0 AND "target_value" > 0 AND "revision" >= 0)
);

CREATE TABLE "badge_awards" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "badge_version_id" UUID NOT NULL,
  "group_id" UUID,
  "source_bunshin_id" UUID,
  "awarded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source_type" VARCHAR(100) NOT NULL,
  "source_id" VARCHAR(200) NOT NULL,
  "evidence_hash" CHAR(64) NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "status" "BadgeAwardStatus" NOT NULL DEFAULT 'ACTIVE',
  "revoked_at" TIMESTAMPTZ(6),
  "expired_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "badge_awards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badge_awards_evidence_hash_check" CHECK ("evidence_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "badge_awards_status_time_check" CHECK (("status" = 'ACTIVE' AND "revoked_at" IS NULL AND "expired_at" IS NULL) OR ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL AND "expired_at" IS NULL) OR ("status" = 'EXPIRED' AND "expired_at" IS NOT NULL AND "revoked_at" IS NULL))
);

CREATE TABLE "badge_processing_events" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "source_event_id" VARCHAR(200) NOT NULL,
  "status" "BadgeProcessingStatus" NOT NULL DEFAULT 'PROCESSING',
  "failure_code" VARCHAR(100),
  "processed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "badge_processing_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "badge_admin_audit_logs" (
  "id" UUID NOT NULL,
  "workspace_id" UUID,
  "group_id" UUID,
  "badge_definition_id" UUID,
  "badge_version_id" UUID,
  "badge_award_id" UUID,
  "action" VARCHAR(80) NOT NULL,
  "before_data" JSONB,
  "after_data" JSONB,
  "reason" VARCHAR(1000) NOT NULL,
  "performed_by_user_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "badge_admin_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "badge_admin_audit_scope_check" CHECK (("workspace_id" IS NULL AND "group_id" IS NULL) OR ("workspace_id" IS NOT NULL AND ("group_id" IS NULL OR "group_id" IS NOT NULL)))
);

CREATE UNIQUE INDEX "badge_definitions_owner_scope_key" ON "badge_definitions" ("owner_type", "code", COALESCE("workspace_id", '00000000-0000-0000-0000-000000000000'::uuid), COALESCE("group_id", '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX "badge_definitions_owner_type_status_code_idx" ON "badge_definitions"("owner_type", "status", "code");
CREATE INDEX "badge_definitions_workspace_id_group_id_status_idx" ON "badge_definitions"("workspace_id", "group_id", "status");
CREATE UNIQUE INDEX "badge_versions_definition_id_version_key" ON "badge_versions"("definition_id", "version");
CREATE INDEX "badge_versions_definition_id_published_at_idx" ON "badge_versions"("definition_id", "published_at");
CREATE UNIQUE INDEX "badge_progress_workspace_id_user_id_badge_version_id_key" ON "badge_progress"("workspace_id", "user_id", "badge_version_id");
CREATE INDEX "badge_progress_workspace_id_user_id_status_updated_at_idx" ON "badge_progress"("workspace_id", "user_id", "status", "updated_at");
CREATE INDEX "badge_progress_group_id_status_idx" ON "badge_progress"("group_id", "status");
CREATE UNIQUE INDEX "badge_awards_workspace_id_user_id_idempotency_key_key" ON "badge_awards"("workspace_id", "user_id", "idempotency_key");
CREATE UNIQUE INDEX "badge_awards_workspace_id_user_id_badge_version_id_key" ON "badge_awards"("workspace_id", "user_id", "badge_version_id");
CREATE INDEX "badge_awards_workspace_id_user_id_status_awarded_at_idx" ON "badge_awards"("workspace_id", "user_id", "status", "awarded_at");
CREATE INDEX "badge_awards_group_id_status_awarded_at_idx" ON "badge_awards"("group_id", "status", "awarded_at");
CREATE UNIQUE INDEX "badge_processing_events_workspace_id_event_type_source_event_id_key" ON "badge_processing_events"("workspace_id", "event_type", "source_event_id");
CREATE INDEX "badge_processing_events_workspace_id_user_id_status_created_at_idx" ON "badge_processing_events"("workspace_id", "user_id", "status", "created_at");
CREATE INDEX "badge_admin_audit_logs_workspace_id_group_id_occurred_at_idx" ON "badge_admin_audit_logs"("workspace_id", "group_id", "occurred_at");
CREATE INDEX "badge_admin_audit_logs_badge_definition_id_occurred_at_idx" ON "badge_admin_audit_logs"("badge_definition_id", "occurred_at");
CREATE INDEX "badge_admin_audit_logs_badge_award_id_occurred_at_idx" ON "badge_admin_audit_logs"("badge_award_id", "occurred_at");

ALTER TABLE "badge_definitions" ADD CONSTRAINT "badge_definitions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_definitions" ADD CONSTRAINT "badge_definitions_group_scope_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_versions" ADD CONSTRAINT "badge_versions_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "badge_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_progress" ADD CONSTRAINT "badge_progress_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_progress" ADD CONSTRAINT "badge_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_progress" ADD CONSTRAINT "badge_progress_badge_version_id_fkey" FOREIGN KEY ("badge_version_id") REFERENCES "badge_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_progress" ADD CONSTRAINT "badge_progress_group_scope_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_awards" ADD CONSTRAINT "badge_awards_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_awards" ADD CONSTRAINT "badge_awards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_awards" ADD CONSTRAINT "badge_awards_badge_version_id_fkey" FOREIGN KEY ("badge_version_id") REFERENCES "badge_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_awards" ADD CONSTRAINT "badge_awards_group_scope_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_awards" ADD CONSTRAINT "badge_awards_source_bunshin_scope_fkey" FOREIGN KEY ("workspace_id", "source_bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_processing_events" ADD CONSTRAINT "badge_processing_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_processing_events" ADD CONSTRAINT "badge_processing_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_admin_audit_logs" ADD CONSTRAINT "badge_admin_audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_admin_audit_logs" ADD CONSTRAINT "badge_admin_audit_logs_group_scope_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_admin_audit_logs" ADD CONSTRAINT "badge_admin_audit_logs_badge_definition_id_fkey" FOREIGN KEY ("badge_definition_id") REFERENCES "badge_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_admin_audit_logs" ADD CONSTRAINT "badge_admin_audit_logs_badge_version_id_fkey" FOREIGN KEY ("badge_version_id") REFERENCES "badge_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_admin_audit_logs" ADD CONSTRAINT "badge_admin_audit_logs_badge_award_id_fkey" FOREIGN KEY ("badge_award_id") REFERENCES "badge_awards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_admin_audit_logs" ADD CONSTRAINT "badge_admin_audit_logs_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
