CREATE TYPE "ServiceSupportAlertMode" AS ENUM ('OPTIONAL_UPSELL', 'INCLUDED_SUPPORT', 'INTERNAL_ESCALATION', 'DISABLED');
CREATE TABLE "service_support_alert_policies" (
  "id" UUID NOT NULL, "workspace_id" UUID NOT NULL, "group_id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL, "mode" "ServiceSupportAlertMode" NOT NULL DEFAULT 'INTERNAL_ESCALATION',
  "updated_by_user_id" UUID NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_support_alert_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_support_alert_policies_group_key" UNIQUE ("group_id"),
  CONSTRAINT "service_support_alert_policies_configuration_key" UNIQUE ("configuration_id"),
  CONSTRAINT "service_support_alert_policies_workspace_group_key" UNIQUE ("workspace_id", "group_id"),
  CONSTRAINT "service_support_alert_policies_scope_configuration_key" UNIQUE ("workspace_id", "group_id", "configuration_id"),
  CONSTRAINT "service_support_alert_policies_group_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_support_alert_policies_configuration_fkey" FOREIGN KEY ("workspace_id", "group_id", "configuration_id") REFERENCES "service_configurations"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "service_support_alert_policies" ENABLE ROW LEVEL SECURITY;
