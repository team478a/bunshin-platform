CREATE TYPE "VideoCompletionNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

ALTER TABLE "video_renders"
  ADD COLUMN "usage_counted_at" TIMESTAMPTZ(6),
  ADD COLUMN "notification_status" "VideoCompletionNotificationStatus",
  ADD COLUMN "notification_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "notification_error_code" VARCHAR(80),
  ADD COLUMN "notified_at" TIMESTAMPTZ(6);

CREATE INDEX "video_renders_notification_status_completed_at_idx"
  ON "video_renders"("notification_status", "completed_at");
