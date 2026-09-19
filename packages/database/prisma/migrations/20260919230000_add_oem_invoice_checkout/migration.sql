ALTER TABLE "tenant_invoices"
  ADD COLUMN "payment_provider" "PaymentProvider",
  ADD COLUMN "provider_checkout_session_id" VARCHAR(200),
  ADD COLUMN "provider_payment_intent_id" VARCHAR(200),
  ADD COLUMN "checkout_url" VARCHAR(2000),
  ADD COLUMN "checkout_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "payment_attempted_at" TIMESTAMPTZ(6),
  ADD COLUMN "payment_failed_at" TIMESTAMPTZ(6),
  ADD COLUMN "payment_failure_category" VARCHAR(80);

CREATE UNIQUE INDEX "tenant_invoices_provider_checkout_session_id_key"
  ON "tenant_invoices"("provider_checkout_session_id");

CREATE TABLE "commercial_billing_webhook_events" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
  "provider_event_id" VARCHAR(200) NOT NULL,
  "event_type" VARCHAR(120) NOT NULL,
  "status" "PaymentWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "payload_digest" VARCHAR(64) NOT NULL,
  "error_category" VARCHAR(80),
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(6),
  CONSTRAINT "commercial_billing_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commercial_billing_webhook_events_workspace_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commercial_billing_webhook_events_invoice_fkey"
    FOREIGN KEY ("workspace_id", "invoice_id") REFERENCES "tenant_invoices"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "commercial_billing_webhook_events_provider_event_id_key"
  ON "commercial_billing_webhook_events"("provider", "provider_event_id");
CREATE INDEX "commercial_billing_webhook_events_workspace_status_received_at_idx"
  ON "commercial_billing_webhook_events"("workspace_id", "status", "received_at");
CREATE INDEX "commercial_billing_webhook_events_invoice_id_received_at_idx"
  ON "commercial_billing_webhook_events"("invoice_id", "received_at");

ALTER TABLE "commercial_billing_webhook_events" ENABLE ROW LEVEL SECURITY;
