CREATE TYPE "AiProviderKey" AS ENUM ('OPENAI', 'EXA', 'FIRECRAWL');
CREATE TYPE "AiProviderConfigurationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED', 'ERROR');

CREATE TABLE "ai_provider_configurations" (
  "id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "provider" "AiProviderKey" NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "AiProviderConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
  "encrypted_api_key" TEXT,
  "api_key_mask" VARCHAR(16),
  "model" VARCHAR(120),
  "daily_budget_usd_micros" INTEGER NOT NULL DEFAULT 1000000,
  "monthly_budget_usd_micros" INTEGER NOT NULL DEFAULT 5000000,
  "globally_paused" BOOLEAN NOT NULL DEFAULT true,
  "key_version" INTEGER NOT NULL DEFAULT 1,
  "last_verified_at" TIMESTAMPTZ(6),
  "last_error_category" VARCHAR(80),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ai_provider_configurations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_provider_budget_nonnegative" CHECK ("daily_budget_usd_micros" >= 0 AND "monthly_budget_usd_micros" >= "daily_budget_usd_micros")
);

CREATE TABLE "ai_provider_configuration_audits" (
  "id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "provider" "AiProviderKey" NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "changed_fields" JSONB NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_provider_configuration_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_provider_configurations_environment_provider_version_key" ON "ai_provider_configurations"("environment", "provider", "version");
CREATE INDEX "ai_provider_configurations_environment_provider_status_idx" ON "ai_provider_configurations"("environment", "provider", "status");
CREATE UNIQUE INDEX "ai_provider_configurations_one_active_per_environment_provider" ON "ai_provider_configurations"("environment", "provider") WHERE "status" = 'ACTIVE';
CREATE INDEX "ai_provider_configuration_audits_configuration_id_occurred_at_idx" ON "ai_provider_configuration_audits"("configuration_id", "occurred_at");
CREATE INDEX "ai_provider_configuration_audits_environment_provider_occurred_at_idx" ON "ai_provider_configuration_audits"("environment", "provider", "occurred_at");
CREATE INDEX "ai_provider_configuration_audits_actor_user_id_occurred_at_idx" ON "ai_provider_configuration_audits"("actor_user_id", "occurred_at");

ALTER TABLE "ai_provider_configuration_audits" ADD CONSTRAINT "ai_provider_configuration_audits_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "ai_provider_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_provider_configuration_audits" ADD CONSTRAINT "ai_provider_configuration_audits_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
