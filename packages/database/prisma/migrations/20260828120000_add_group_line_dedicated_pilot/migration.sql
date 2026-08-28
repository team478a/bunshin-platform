CREATE TYPE "GroupLineMode" AS ENUM ('SHARED', 'DEDICATED', 'DISABLED');

CREATE TABLE "group_line_routing_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "mode" "GroupLineMode" NOT NULL DEFAULT 'SHARED',
  "pilot_enabled" BOOLEAN NOT NULL DEFAULT false,
  "reason" VARCHAR(500) NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "group_line_routing_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "group_line_routing_policies_dedicated_pilot_check"
    CHECK (("mode" = 'DEDICATED' AND "pilot_enabled" = true) OR ("mode" <> 'DEDICATED' AND "pilot_enabled" = false))
);

CREATE TABLE "group_line_channel_configurations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "LineConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
  "webhook_routing_key" UUID NOT NULL DEFAULT gen_random_uuid(),
  "login_channel_id" VARCHAR(64) NOT NULL,
  "encrypted_login_secret" TEXT NOT NULL,
  "login_secret_mask" VARCHAR(16) NOT NULL,
  "messaging_channel_id" VARCHAR(64) NOT NULL,
  "encrypted_messaging_secret" TEXT NOT NULL,
  "messaging_secret_mask" VARCHAR(16) NOT NULL,
  "encrypted_access_token" TEXT NOT NULL,
  "access_token_mask" VARCHAR(16) NOT NULL,
  "liff_id" VARCHAR(128),
  "globally_paused" BOOLEAN NOT NULL DEFAULT true,
  "quota_warning_percent" INTEGER NOT NULL DEFAULT 80,
  "quota_low_priority_stop" INTEGER NOT NULL DEFAULT 90,
  "key_version" INTEGER NOT NULL DEFAULT 1,
  "last_verified_at" TIMESTAMPTZ(6),
  "last_error_category" VARCHAR(80),
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "group_line_channel_configurations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "group_line_channel_configurations_quota_check"
    CHECK ("quota_warning_percent" BETWEEN 1 AND 99 AND "quota_low_priority_stop" BETWEEN 2 AND 100 AND "quota_warning_percent" < "quota_low_priority_stop"),
  CONSTRAINT "group_line_channel_configurations_version_check" CHECK ("version" > 0),
  CONSTRAINT "group_line_channel_configurations_key_version_check" CHECK ("key_version" > 0)
);

CREATE TABLE "group_line_configuration_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "configuration_id" UUID,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "before_data" JSONB,
  "after_data" JSONB,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_line_configuration_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_line_routing_policies_workspace_group_environment_key"
  ON "group_line_routing_policies"("workspace_id", "group_id", "environment");
CREATE INDEX "group_line_routing_policies_environment_mode_pilot_idx"
  ON "group_line_routing_policies"("environment", "mode", "pilot_enabled");
CREATE INDEX "group_line_routing_policies_editor_updated_idx"
  ON "group_line_routing_policies"("updated_by_user_id", "updated_at");

CREATE UNIQUE INDEX "group_line_channel_configurations_scope_version_key"
  ON "group_line_channel_configurations"("workspace_id", "group_id", "environment", "version");
CREATE UNIQUE INDEX "group_line_channel_configurations_routing_key_key"
  ON "group_line_channel_configurations"("webhook_routing_key");
CREATE UNIQUE INDEX "group_line_channel_configurations_one_active_per_scope_idx"
  ON "group_line_channel_configurations"("workspace_id", "group_id", "environment")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "group_line_channel_configurations_scope_status_idx"
  ON "group_line_channel_configurations"("workspace_id", "group_id", "environment", "status");
CREATE INDEX "group_line_channel_configurations_creator_created_idx"
  ON "group_line_channel_configurations"("created_by_user_id", "created_at");

CREATE INDEX "group_line_configuration_audits_scope_occurred_idx"
  ON "group_line_configuration_audits"("workspace_id", "group_id", "environment", "occurred_at");
CREATE INDEX "group_line_configuration_audits_configuration_occurred_idx"
  ON "group_line_configuration_audits"("configuration_id", "occurred_at");
CREATE INDEX "group_line_configuration_audits_actor_occurred_idx"
  ON "group_line_configuration_audits"("actor_user_id", "occurred_at");

ALTER TABLE "group_line_routing_policies"
  ADD CONSTRAINT "group_line_routing_policies_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "group_line_routing_policies_workspace_group_fkey"
  FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "group_line_routing_policies_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "group_line_channel_configurations"
  ADD CONSTRAINT "group_line_channel_configurations_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "group_line_channel_configurations_workspace_group_fkey"
  FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "group_line_channel_configurations_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "group_line_configuration_audits"
  ADD CONSTRAINT "group_line_configuration_audits_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "group_line_configuration_audits_workspace_group_fkey"
  FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "group_line_configuration_audits_configuration_id_fkey"
  FOREIGN KEY ("configuration_id") REFERENCES "group_line_channel_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_line_configuration_audits_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
