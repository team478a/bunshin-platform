-- Additive global provider cost reservation ledger. No historical rows are inferred.
CREATE TABLE "ai_provider_call_admissions" (
  "id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "provider" "AiProviderKey" NOT NULL,
  "operation_hash" CHAR(64) NOT NULL,
  "reserved_cost_usd_micros" BIGINT NOT NULL,
  "admitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at" TIMESTAMPTZ(3),
  CONSTRAINT "ai_provider_call_admissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_provider_call_admissions_configuration_fkey" FOREIGN KEY ("configuration_id") REFERENCES "ai_provider_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ai_provider_call_admissions_cost_check" CHECK ("reserved_cost_usd_micros" > 0),
  CONSTRAINT "ai_provider_call_admissions_settled_check" CHECK ("settled_at" IS NULL OR "settled_at" >= "admitted_at"),
  CONSTRAINT "ai_provider_call_admissions_hash_check" CHECK ("operation_hash" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "ai_provider_call_admissions_operation_key" ON "ai_provider_call_admissions"("environment", "provider", "operation_hash");
CREATE INDEX "ai_provider_call_admissions_day_idx" ON "ai_provider_call_admissions"("environment", "provider", "admitted_at");
CREATE INDEX "ai_provider_call_admissions_open_idx" ON "ai_provider_call_admissions"("environment", "provider", "settled_at");
ALTER TABLE "ai_provider_call_admissions" ENABLE ROW LEVEL SECURITY;
-- No public policy: existing trusted server role only.
