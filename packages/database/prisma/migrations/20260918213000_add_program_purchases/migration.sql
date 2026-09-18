CREATE TYPE "ProgramPurchaseStatus" AS ENUM ('CREATED', 'CHECKOUT_OPEN', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED');
CREATE TYPE "PaymentWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

CREATE TABLE "program_purchases" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "buyer_user_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "source_enrollment_id" UUID NOT NULL,
  "program_offering_id" UUID NOT NULL,
  "payment_configuration_id" UUID NOT NULL,
  "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
  "status" "ProgramPurchaseStatus" NOT NULL DEFAULT 'CREATED',
  "amount_yen" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'JPY',
  "idempotency_key" VARCHAR(200) NOT NULL,
  "provider_checkout_session_id" VARCHAR(200),
  "provider_payment_intent_id" VARCHAR(200),
  "paid_enrollment_id" UUID,
  "checkout_expires_at" TIMESTAMPTZ(6),
  "paid_at" TIMESTAMPTZ(6),
  "metadata" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "program_purchases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "program_purchases_amount_positive" CHECK ("amount_yen" > 0),
  CONSTRAINT "program_purchases_currency_jpy" CHECK ("currency" = 'JPY')
);

CREATE TABLE "payment_webhook_events" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "payment_configuration_id" UUID NOT NULL,
  "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
  "provider_event_id" VARCHAR(200) NOT NULL,
  "event_type" VARCHAR(120) NOT NULL,
  "status" "PaymentWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "payload_digest" VARCHAR(64) NOT NULL,
  "error_category" VARCHAR(80),
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(6),
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "program_purchases_workspace_id_group_id_idempotency_key_key" ON "program_purchases"("workspace_id", "group_id", "idempotency_key");
CREATE UNIQUE INDEX "program_purchases_workspace_id_id_key" ON "program_purchases"("workspace_id", "id");
CREATE UNIQUE INDEX "program_purchases_provider_checkout_session_id_key" ON "program_purchases"("provider_checkout_session_id");
CREATE UNIQUE INDEX "program_purchases_provider_payment_intent_id_key" ON "program_purchases"("provider_payment_intent_id");
CREATE UNIQUE INDEX "program_purchases_paid_enrollment_id_key" ON "program_purchases"("paid_enrollment_id");
CREATE INDEX "program_purchases_workspace_id_group_id_buyer_user_id_status_idx" ON "program_purchases"("workspace_id", "group_id", "buyer_user_id", "status");
CREATE INDEX "program_purchases_payment_configuration_id_status_created_at_idx" ON "program_purchases"("payment_configuration_id", "status", "created_at");
CREATE UNIQUE INDEX "payment_webhook_events_payment_configuration_id_provider_event_id_key" ON "payment_webhook_events"("payment_configuration_id", "provider_event_id");
CREATE INDEX "payment_webhook_events_workspace_id_status_received_at_idx" ON "payment_webhook_events"("workspace_id", "status", "received_at");

ALTER TABLE "program_purchases" ADD CONSTRAINT "program_purchases_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_purchases" ADD CONSTRAINT "program_purchases_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_purchases" ADD CONSTRAINT "program_purchases_payment_configuration_fkey" FOREIGN KEY ("workspace_id", "payment_configuration_id") REFERENCES "organization_payment_configurations"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_configuration_fkey" FOREIGN KEY ("workspace_id", "payment_configuration_id") REFERENCES "organization_payment_configurations"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "program_purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_webhook_events" ENABLE ROW LEVEL SECURITY;
