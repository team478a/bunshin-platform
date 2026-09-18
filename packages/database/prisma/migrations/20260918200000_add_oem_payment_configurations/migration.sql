CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE');
CREATE TYPE "OrganizationPaymentConfigurationStatus" AS ENUM ('DRAFT', 'VERIFIED', 'ACTIVE', 'DISABLED', 'ERROR');

CREATE TABLE "organization_payment_configurations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "environment" "LineConfigurationEnvironment" NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
    "status" "OrganizationPaymentConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "account_reference" VARCHAR(200),
    "encrypted_secret_key" TEXT NOT NULL,
    "secret_key_mask" VARCHAR(24) NOT NULL,
    "encrypted_webhook_secret" TEXT,
    "webhook_secret_mask" VARCHAR(24),
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "last_verified_at" TIMESTAMPTZ(6),
    "last_error_category" VARCHAR(80),
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "organization_payment_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_payment_configuration_audits" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "configuration_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "changed_fields" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_payment_configuration_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_payment_configurations_workspace_environment_provider_key" ON "organization_payment_configurations"("workspace_id", "environment", "provider");
CREATE UNIQUE INDEX "organization_payment_configurations_workspace_id_id_key" ON "organization_payment_configurations"("workspace_id", "id");
CREATE INDEX "organization_payment_configurations_environment_status_idx" ON "organization_payment_configurations"("environment", "status");
CREATE INDEX "organization_payment_configuration_audits_workspace_occurred_idx" ON "organization_payment_configuration_audits"("workspace_id", "occurred_at");
CREATE INDEX "organization_payment_configuration_audits_configuration_occurred_idx" ON "organization_payment_configuration_audits"("configuration_id", "occurred_at");

ALTER TABLE "organization_payment_configurations" ADD CONSTRAINT "organization_payment_configurations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_payment_configurations" ADD CONSTRAINT "organization_payment_configurations_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_payment_configuration_audits" ADD CONSTRAINT "organization_payment_configuration_audits_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_payment_configuration_audits" ADD CONSTRAINT "organization_payment_configuration_audits_workspace_configuration_id_fkey" FOREIGN KEY ("workspace_id", "configuration_id") REFERENCES "organization_payment_configurations"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_payment_configuration_audits" ADD CONSTRAINT "organization_payment_configuration_audits_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organization_payment_configurations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_payment_configuration_audits" ENABLE ROW LEVEL SECURITY;
