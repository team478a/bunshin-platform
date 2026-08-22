CREATE TYPE "LineConfigurationEnvironment" AS ENUM ('DEVELOPMENT', 'STAGING', 'PRODUCTION');
CREATE TYPE "LineConfigurationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED', 'ERROR');

CREATE TABLE "line_channel_configurations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "LineConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
  "login_channel_id" VARCHAR(64) NOT NULL,
  "encrypted_login_secret" TEXT NOT NULL,
  "login_secret_mask" VARCHAR(16) NOT NULL,
  "messaging_channel_id" VARCHAR(64) NOT NULL,
  "encrypted_messaging_secret" TEXT NOT NULL,
  "messaging_secret_mask" VARCHAR(16) NOT NULL,
  "encrypted_access_token" TEXT NOT NULL,
  "access_token_mask" VARCHAR(16) NOT NULL,
  "liff_id" VARCHAR(128),
  "default_notification_time" VARCHAR(5) NOT NULL DEFAULT '08:00',
  "default_timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Tokyo',
  "quiet_hours_start" VARCHAR(5) NOT NULL DEFAULT '21:00',
  "quiet_hours_end" VARCHAR(5) NOT NULL DEFAULT '07:00',
  "globally_paused" BOOLEAN NOT NULL DEFAULT false,
  "quota_warning_percent" INTEGER NOT NULL DEFAULT 80,
  "quota_low_priority_stop" INTEGER NOT NULL DEFAULT 90,
  "key_version" INTEGER NOT NULL DEFAULT 1,
  "last_verified_at" TIMESTAMPTZ(6),
  "last_error_category" VARCHAR(80),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "line_channel_configurations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "line_configuration_quota_check" CHECK ("quota_warning_percent" BETWEEN 1 AND 99 AND "quota_low_priority_stop" BETWEEN 2 AND 100 AND "quota_warning_percent" < "quota_low_priority_stop")
);

CREATE UNIQUE INDEX "line_channel_configurations_environment_version_key" ON "line_channel_configurations"("environment", "version");
CREATE UNIQUE INDEX "line_channel_configurations_one_active_per_environment" ON "line_channel_configurations"("environment") WHERE "status" = 'ACTIVE';
CREATE INDEX "line_channel_configurations_environment_status_idx" ON "line_channel_configurations"("environment", "status");

CREATE TABLE "line_configuration_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "configuration_id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "changed_fields" JSONB NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "line_configuration_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "line_configuration_audits_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "line_channel_configurations"("id") ON DELETE RESTRICT,
  CONSTRAINT "line_configuration_audits_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE INDEX "line_configuration_audits_configuration_id_occurred_at_idx" ON "line_configuration_audits"("configuration_id", "occurred_at");
CREATE INDEX "line_configuration_audits_environment_occurred_at_idx" ON "line_configuration_audits"("environment", "occurred_at");
CREATE INDEX "line_configuration_audits_actor_user_id_occurred_at_idx" ON "line_configuration_audits"("actor_user_id", "occurred_at");
