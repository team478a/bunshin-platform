CREATE TYPE "ServiceMessageTemplateChannel" AS ENUM ('EMAIL', 'LINE');
CREATE TYPE "ServiceMessageTemplatePurpose" AS ENUM ('REGISTRATION_COMPLETE', 'REMINDER', 'WEEKLY_REPORT', 'GENERAL_ANNOUNCEMENT');

CREATE TABLE "service_message_templates" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "channel" "ServiceMessageTemplateChannel" NOT NULL,
  "purpose" "ServiceMessageTemplatePurpose" NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "subject" VARCHAR(200),
  "body" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_message_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_message_templates_scope_fkey" FOREIGN KEY ("workspace_id", "group_id", "configuration_id") REFERENCES "service_configurations"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "service_message_templates_workspace_group_id_key" ON "service_message_templates"("workspace_id", "group_id", "id");
CREATE INDEX "service_message_templates_scope_lookup_idx" ON "service_message_templates"("workspace_id", "group_id", "channel", "purpose", "is_active");
CREATE INDEX "service_message_templates_configuration_updated_idx" ON "service_message_templates"("configuration_id", "updated_at");

ALTER TABLE "service_message_templates" ENABLE ROW LEVEL SECURITY;
