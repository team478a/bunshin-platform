ALTER TABLE "ai_provider_configurations"
ADD COLUMN "request_cost_usd_micros" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ai_provider_configurations"
ADD CONSTRAINT "ai_provider_configurations_request_cost_check"
CHECK ("request_cost_usd_micros" >= 0);
