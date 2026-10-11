ALTER TABLE "ai_provider_call_admissions"
ADD COLUMN "last_alerted_at" TIMESTAMPTZ(3);

CREATE INDEX "ai_provider_call_admissions_alert_idx"
ON "ai_provider_call_admissions"("environment", "settled_at", "admitted_at", "last_alerted_at");
