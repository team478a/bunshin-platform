ALTER TYPE "LineMessageDeliveryStatus" ADD VALUE 'PROCESSING' AFTER 'PENDING';

ALTER TABLE "line_message_deliveries"
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lease_owner" VARCHAR(100),
  ADD COLUMN "lease_expires_at" TIMESTAMPTZ(6);

ALTER TABLE "line_message_deliveries"
  ADD CONSTRAINT "line_message_deliveries_attempt_count_check" CHECK ("attempt_count" >= 0);

CREATE INDEX "line_message_deliveries_environment_status_lease_expires_at_idx"
  ON "line_message_deliveries"("environment", "status", "lease_expires_at");
