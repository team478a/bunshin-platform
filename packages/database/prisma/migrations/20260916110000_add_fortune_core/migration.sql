ALTER TYPE "CapabilityType" ADD VALUE IF NOT EXISTS 'FORTUNE';

CREATE TYPE "FortuneTheme" AS ENUM ('LOVE', 'WORK', 'RELATIONSHIPS');
CREATE TYPE "FortuneOrientation" AS ENUM ('UPRIGHT', 'REVERSED');
CREATE TYPE "FortuneReadingStatus" AS ENUM ('GENERATING', 'READY_AI', 'READY_BASIC', 'FAILED', 'DELETED');
CREATE TYPE "FortuneKnowledgeStatus" AS ENUM ('DRAFT', 'APPROVED', 'RETIRED');

CREATE TABLE "fortune_service_settings" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "ai_enabled" BOOLEAN NOT NULL DEFAULT false,
  "minimum_age" INTEGER NOT NULL DEFAULT 18,
  "time_zone" VARCHAR(80) NOT NULL DEFAULT 'Asia/Tokyo',
  "history_retention_days" INTEGER NOT NULL DEFAULT 90,
  "weekly_notification_enabled" BOOLEAN NOT NULL DEFAULT false,
  "weekly_notification_day" INTEGER NOT NULL DEFAULT 3,
  "weekly_notification_hour" INTEGER NOT NULL DEFAULT 19,
  "monthly_ai_cost_cap_yen" INTEGER NOT NULL DEFAULT 10000,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fortune_service_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fortune_service_settings_minimum_age_check" CHECK ("minimum_age" >= 18),
  CONSTRAINT "fortune_service_settings_retention_check" CHECK ("history_retention_days" BETWEEN 1 AND 3650),
  CONSTRAINT "fortune_service_settings_weekday_check" CHECK ("weekly_notification_day" BETWEEN 0 AND 6),
  CONSTRAINT "fortune_service_settings_hour_check" CHECK ("weekly_notification_hour" BETWEEN 0 AND 23),
  CONSTRAINT "fortune_service_settings_cost_cap_check" CHECK ("monthly_ai_cost_cap_yen" >= 0)
);

ALTER TABLE "fortune_service_settings" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "fortune_service_settings_group_id_key" ON "fortune_service_settings"("group_id");
CREATE UNIQUE INDEX "fortune_service_settings_configuration_id_key" ON "fortune_service_settings"("configuration_id");
CREATE UNIQUE INDEX "fortune_service_settings_bunshin_id_key" ON "fortune_service_settings"("bunshin_id");
CREATE UNIQUE INDEX "fortune_service_settings_workspace_bunshin_key" ON "fortune_service_settings"("workspace_id", "bunshin_id");
CREATE UNIQUE INDEX "fortune_service_settings_scope_id_key" ON "fortune_service_settings"("workspace_id", "group_id", "id");
CREATE INDEX "fortune_service_settings_workspace_id_enabled_idx" ON "fortune_service_settings"("workspace_id", "enabled");

CREATE TABLE "fortune_participants" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "service_setting_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "age_confirmed_at" TIMESTAMPTZ(6) NOT NULL,
  "notification_enabled" BOOLEAN NOT NULL DEFAULT false,
  "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawn_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fortune_participants_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "fortune_participants" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "fortune_participants_group_membership_id_key" ON "fortune_participants"("group_membership_id");
CREATE UNIQUE INDEX "fortune_participants_service_setting_id_user_id_key" ON "fortune_participants"("service_setting_id", "user_id");
CREATE UNIQUE INDEX "fortune_participants_membership_scope_key" ON "fortune_participants"("workspace_id", "group_id", "group_membership_id", "user_id");
CREATE UNIQUE INDEX "fortune_participants_scope_id_user_key" ON "fortune_participants"("workspace_id", "group_id", "id", "user_id");
CREATE INDEX "fortune_participants_service_setting_id_withdrawn_at_idx" ON "fortune_participants"("service_setting_id", "withdrawn_at");

CREATE TABLE "fortune_knowledge_versions" (
  "id" UUID NOT NULL,
  "service_setting_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "FortuneKnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
  "prompt_version" VARCHAR(80) NOT NULL,
  "approved_by_user_id" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fortune_knowledge_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fortune_knowledge_versions_version_check" CHECK ("version" > 0)
);

ALTER TABLE "fortune_knowledge_versions" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "fortune_knowledge_versions_service_setting_id_version_key" ON "fortune_knowledge_versions"("service_setting_id", "version");
CREATE INDEX "fortune_knowledge_versions_service_setting_id_status_idx" ON "fortune_knowledge_versions"("service_setting_id", "status");

CREATE TABLE "fortune_card_meanings" (
  "id" UUID NOT NULL,
  "knowledge_version_id" UUID NOT NULL,
  "card_code" VARCHAR(40) NOT NULL,
  "orientation" "FortuneOrientation" NOT NULL,
  "theme" "FortuneTheme" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" TEXT NOT NULL,
  "action_step" VARCHAR(500) NOT NULL,
  "safety_reviewed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fortune_card_meanings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "fortune_card_meanings" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "fortune_card_meanings_version_card_orientation_theme_key" ON "fortune_card_meanings"("knowledge_version_id", "card_code", "orientation", "theme");
CREATE INDEX "fortune_card_meanings_knowledge_version_id_safety_reviewed_idx" ON "fortune_card_meanings"("knowledge_version_id", "safety_reviewed");

CREATE TABLE "fortune_readings" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "service_setting_id" UUID NOT NULL,
  "participant_id" UUID NOT NULL,
  "member_user_id" UUID NOT NULL,
  "knowledge_version_id" UUID,
  "local_date" DATE NOT NULL,
  "theme" "FortuneTheme" NOT NULL,
  "card_code" VARCHAR(40) NOT NULL,
  "orientation" "FortuneOrientation" NOT NULL,
  "status" "FortuneReadingStatus" NOT NULL DEFAULT 'GENERATING',
  "reading_text" TEXT,
  "action_step" VARCHAR(500),
  "model_name" VARCHAR(120),
  "prompt_version" VARCHAR(80),
  "failure_code" VARCHAR(80),
  "generated_at" TIMESTAMPTZ(6),
  "deleted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fortune_readings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "fortune_readings" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "fortune_readings_service_participant_local_date_key" ON "fortune_readings"("service_setting_id", "participant_id", "local_date");
CREATE INDEX "fortune_readings_member_user_id_created_at_idx" ON "fortune_readings"("member_user_id", "created_at" DESC);
CREATE INDEX "fortune_readings_service_setting_id_status_created_at_idx" ON "fortune_readings"("service_setting_id", "status", "created_at" DESC);

ALTER TABLE "fortune_service_settings" ADD CONSTRAINT "fortune_service_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fortune_service_settings" ADD CONSTRAINT "fortune_service_settings_group_scope_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fortune_service_settings" ADD CONSTRAINT "fortune_service_settings_configuration_scope_fkey" FOREIGN KEY ("workspace_id", "group_id", "configuration_id") REFERENCES "service_configurations"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fortune_service_settings" ADD CONSTRAINT "fortune_service_settings_bunshin_scope_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fortune_participants" ADD CONSTRAINT "fortune_participants_service_scope_fkey" FOREIGN KEY ("workspace_id", "group_id", "service_setting_id") REFERENCES "fortune_service_settings"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fortune_participants" ADD CONSTRAINT "fortune_participants_membership_scope_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fortune_participants" ADD CONSTRAINT "fortune_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fortune_knowledge_versions" ADD CONSTRAINT "fortune_knowledge_versions_service_setting_id_fkey" FOREIGN KEY ("service_setting_id") REFERENCES "fortune_service_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fortune_knowledge_versions" ADD CONSTRAINT "fortune_knowledge_versions_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fortune_card_meanings" ADD CONSTRAINT "fortune_card_meanings_knowledge_version_id_fkey" FOREIGN KEY ("knowledge_version_id") REFERENCES "fortune_knowledge_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fortune_readings" ADD CONSTRAINT "fortune_readings_service_scope_fkey" FOREIGN KEY ("workspace_id", "group_id", "service_setting_id") REFERENCES "fortune_service_settings"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fortune_readings" ADD CONSTRAINT "fortune_readings_participant_scope_fkey" FOREIGN KEY ("workspace_id", "group_id", "participant_id", "member_user_id") REFERENCES "fortune_participants"("workspace_id", "group_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fortune_readings" ADD CONSTRAINT "fortune_readings_member_user_id_fkey" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fortune_readings" ADD CONSTRAINT "fortune_readings_knowledge_version_id_fkey" FOREIGN KEY ("knowledge_version_id") REFERENCES "fortune_knowledge_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
