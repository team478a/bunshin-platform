CREATE TYPE "AdminEmailConfigurationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED', 'ERROR');

CREATE TABLE "admin_email_configurations" (
  "id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "AdminEmailConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
  "encrypted_api_key" TEXT NOT NULL,
  "api_key_mask" VARCHAR(16) NOT NULL,
  "from_email" VARCHAR(320) NOT NULL,
  "recipient_emails" JSONB NOT NULL,
  "globally_paused" BOOLEAN NOT NULL DEFAULT true,
  "key_version" INTEGER NOT NULL DEFAULT 1,
  "last_verified_at" TIMESTAMPTZ(6),
  "last_error_category" VARCHAR(80),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "admin_email_configurations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "admin_email_configuration_audits" (
  "id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "changed_fields" JSONB NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_email_configuration_audits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_email_configurations_environment_version_key" ON "admin_email_configurations"("environment", "version");
CREATE INDEX "admin_email_configurations_environment_status_idx" ON "admin_email_configurations"("environment", "status");
CREATE UNIQUE INDEX "admin_email_configurations_one_active_per_environment" ON "admin_email_configurations"("environment") WHERE "status" = 'ACTIVE';
CREATE INDEX "admin_email_configuration_audits_configuration_id_occurred_at_idx" ON "admin_email_configuration_audits"("configuration_id", "occurred_at");
CREATE INDEX "admin_email_configuration_audits_environment_occurred_at_idx" ON "admin_email_configuration_audits"("environment", "occurred_at");
CREATE INDEX "admin_email_configuration_audits_actor_user_id_occurred_at_idx" ON "admin_email_configuration_audits"("actor_user_id", "occurred_at");
ALTER TABLE "admin_email_configuration_audits" ADD CONSTRAINT "admin_email_configuration_audits_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "admin_email_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admin_email_configuration_audits" ADD CONSTRAINT "admin_email_configuration_audits_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
