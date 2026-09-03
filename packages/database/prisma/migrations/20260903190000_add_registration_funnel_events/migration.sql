CREATE TYPE "RegistrationFunnelEventType" AS ENUM (
  'LANDING_VIEWED',
  'LINE_AUTHENTICATED',
  'ONBOARDING_STARTED',
  'ONBOARDING_COMPLETED',
  'FIRST_POST_VIEWED',
  'FIRST_POST_COPIED',
  'ORGANIZATION_JOINED',
  'GROUP_JOINED'
);

CREATE TABLE "registration_funnel_events" (
  "id" UUID NOT NULL,
  "event_type" "RegistrationFunnelEventType" NOT NULL,
  "user_id" UUID,
  "visitor_key_hash" CHAR(64),
  "source" VARCHAR(40) NOT NULL DEFAULT 'WEB',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "idempotency_key" VARCHAR(200) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "registration_funnel_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "registration_funnel_events_idempotency_key_key"
  ON "registration_funnel_events"("idempotency_key");
CREATE INDEX "registration_funnel_events_event_type_occurred_at_idx"
  ON "registration_funnel_events"("event_type", "occurred_at");
CREATE INDEX "registration_funnel_events_user_id_occurred_at_idx"
  ON "registration_funnel_events"("user_id", "occurred_at");
CREATE INDEX "registration_funnel_events_visitor_key_hash_occurred_at_idx"
  ON "registration_funnel_events"("visitor_key_hash", "occurred_at");
ALTER TABLE "registration_funnel_events"
  ADD CONSTRAINT "registration_funnel_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registration_funnel_events"
  ADD CONSTRAINT "registration_funnel_events_identity_check"
  CHECK ("user_id" IS NOT NULL OR "visitor_key_hash" IS NOT NULL);
