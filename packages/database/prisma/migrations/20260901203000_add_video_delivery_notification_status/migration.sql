CREATE TYPE "VideoDeliveryNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

ALTER TYPE "VideoDeliveryEventType" ADD VALUE 'LINE_NOTIFICATION';

ALTER TABLE "video_deliveries"
  ADD COLUMN "notification_status" "VideoDeliveryNotificationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "notification_error_code" VARCHAR(80),
  ADD COLUMN "notification_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "notified_at" TIMESTAMPTZ(6);

CREATE INDEX "video_deliveries_notification_status_created_at_idx"
  ON "video_deliveries"("notification_status", "created_at");
