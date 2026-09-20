CREATE TYPE "ServiceRegistrationEmailProviderMode" AS ENUM ('PLATFORM', 'DEDICATED_RESEND');
CREATE TYPE "ServiceRegistrationEmailDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "service_registration_email_configurations" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "provider_mode" "ServiceRegistrationEmailProviderMode" NOT NULL DEFAULT 'PLATFORM',
  "encrypted_api_key" TEXT,
  "api_key_mask" VARCHAR(16),
  "key_version" INTEGER NOT NULL DEFAULT 1,
  "from_name" VARCHAR(120) NOT NULL,
  "from_email" VARCHAR(320) NOT NULL,
  "reply_to_email" VARCHAR(320),
  "subject" VARCHAR(200) NOT NULL,
  "body" TEXT NOT NULL,
  "last_verified_at" TIMESTAMPTZ(6),
  "last_error_category" VARCHAR(80),
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_registration_email_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_registration_email_deliveries" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "email_configuration_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "recipient_email" VARCHAR(320) NOT NULL,
  "recipient_name" VARCHAR(120),
  "from_name" VARCHAR(120) NOT NULL,
  "from_email" VARCHAR(320) NOT NULL,
  "reply_to_email" VARCHAR(320),
  "subject" VARCHAR(200) NOT NULL,
  "body" TEXT NOT NULL,
  "status" "ServiceRegistrationEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "provider_message_id" VARCHAR(200),
  "last_error_category" VARCHAR(80),
  "sent_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_registration_email_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_registration_email_configurations_group_id_key" ON "service_registration_email_configurations"("group_id");
CREATE UNIQUE INDEX "service_registration_email_configurations_configuration_id_key" ON "service_registration_email_configurations"("configuration_id");
CREATE UNIQUE INDEX "service_registration_email_configurations_workspace_group_key" ON "service_registration_email_configurations"("workspace_id", "group_id");
CREATE UNIQUE INDEX "service_registration_email_configurations_scope_key" ON "service_registration_email_configurations"("workspace_id", "group_id", "configuration_id");
CREATE INDEX "service_registration_email_configurations_enabled_provider_idx" ON "service_registration_email_configurations"("enabled", "provider_mode");
CREATE UNIQUE INDEX "service_registration_email_deliveries_membership_configuration_key" ON "service_registration_email_deliveries"("group_membership_id", "email_configuration_id");
CREATE INDEX "service_registration_email_deliveries_status_next_attempt_idx" ON "service_registration_email_deliveries"("status", "next_attempt_at");
CREATE INDEX "service_registration_email_deliveries_scope_created_idx" ON "service_registration_email_deliveries"("workspace_id", "group_id", "created_at");

ALTER TABLE "service_registration_email_configurations"
  ADD CONSTRAINT "service_registration_email_configurations_configuration_fkey"
  FOREIGN KEY ("workspace_id", "group_id", "configuration_id")
  REFERENCES "service_configurations"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_registration_email_deliveries"
  ADD CONSTRAINT "service_registration_email_deliveries_email_configuration_fkey"
  FOREIGN KEY ("email_configuration_id")
  REFERENCES "service_registration_email_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_registration_email_configurations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_registration_email_deliveries" ENABLE ROW LEVEL SECURITY;
