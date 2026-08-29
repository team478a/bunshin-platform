ALTER TABLE "badge_line_notification_deliveries"
ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
ADD COLUMN "lease_owner" VARCHAR(100),
ADD COLUMN "lease_expires_at" TIMESTAMPTZ(6);

CREATE INDEX "badge_line_notification_deliveries_lease_expires_at_idx"
ON "badge_line_notification_deliveries"("lease_expires_at");
