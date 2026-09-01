CREATE TYPE "ServiceBillingMode" AS ENUM ('FREE', 'MANUAL_INVOICE', 'EXTERNAL_BILLING');
CREATE TYPE "ServiceCommercialStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ENDED');

CREATE TABLE "service_commercial_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "plan_name" VARCHAR(120) NOT NULL,
  "billing_mode" "ServiceBillingMode" NOT NULL DEFAULT 'FREE',
  "status" "ServiceCommercialStatus" NOT NULL DEFAULT 'DRAFT',
  "monthly_price_yen" INTEGER,
  "included_member_limit" INTEGER,
  "monthly_ai_generation_limit" INTEGER,
  "monthly_image_generation_limit" INTEGER,
  "monthly_video_generation_limit" INTEGER,
  "starts_at" TIMESTAMPTZ(6),
  "ends_at" TIMESTAMPTZ(6),
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_commercial_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_commercial_settings_group_id_key" UNIQUE ("group_id"),
  CONSTRAINT "service_commercial_settings_configuration_id_key" UNIQUE ("configuration_id"),
  CONSTRAINT "service_commercial_settings_workspace_id_group_id_key" UNIQUE ("workspace_id", "group_id"),
  CONSTRAINT "svc_commercial_setting_workspace_group_config_key" UNIQUE ("workspace_id", "group_id", "configuration_id"),
  CONSTRAINT "service_commercial_settings_monthly_price_yen_check" CHECK ("monthly_price_yen" IS NULL OR "monthly_price_yen" >= 0),
  CONSTRAINT "service_commercial_settings_included_member_limit_check" CHECK ("included_member_limit" IS NULL OR "included_member_limit" >= 1),
  CONSTRAINT "service_commercial_settings_monthly_ai_generation_limit_check" CHECK ("monthly_ai_generation_limit" IS NULL OR "monthly_ai_generation_limit" >= 1),
  CONSTRAINT "service_commercial_settings_monthly_image_generation_limit_check" CHECK ("monthly_image_generation_limit" IS NULL OR "monthly_image_generation_limit" >= 1),
  CONSTRAINT "service_commercial_settings_monthly_video_generation_limit_check" CHECK ("monthly_video_generation_limit" IS NULL OR "monthly_video_generation_limit" >= 1),
  CONSTRAINT "service_commercial_settings_period_check" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at"),
  CONSTRAINT "service_commercial_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_commercial_settings_workspace_id_group_id_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "svc_commercial_setting_config_fkey" FOREIGN KEY ("workspace_id", "group_id", "configuration_id") REFERENCES "service_configurations"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_commercial_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "service_commercial_settings_status_starts_at_ends_at_idx"
ON "service_commercial_settings"("status", "starts_at", "ends_at");
