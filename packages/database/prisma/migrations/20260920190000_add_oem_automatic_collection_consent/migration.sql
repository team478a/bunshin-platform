ALTER TABLE "organization_commercial_contracts"
  ADD COLUMN "automatic_collection_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "automatic_collection_consent_at" TIMESTAMPTZ(6),
  ADD COLUMN "stripe_customer_id" VARCHAR(200),
  ADD COLUMN "stripe_payment_method_id" VARCHAR(200);

CREATE INDEX "organization_commercial_contracts_auto_collection_idx"
  ON "organization_commercial_contracts"("status", "automatic_collection_enabled");
