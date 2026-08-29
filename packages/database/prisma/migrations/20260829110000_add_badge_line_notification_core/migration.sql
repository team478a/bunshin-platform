CREATE TYPE "BadgeLineNotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED', 'DEAD');

CREATE TABLE "badge_line_notification_deliveries" (
    "id" UUID NOT NULL,
    "environment" "LineConfigurationEnvironment" NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "badge_notification_id" UUID NOT NULL,
    "status" "BadgeLineNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" VARCHAR(200) NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_category" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "badge_line_notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "badge_line_notification_deliveries_environment_badge_notification_id_key"
ON "badge_line_notification_deliveries"("environment", "badge_notification_id");
CREATE UNIQUE INDEX "badge_line_notification_deliveries_environment_idempotency_key_key"
ON "badge_line_notification_deliveries"("environment", "idempotency_key");
CREATE INDEX "badge_line_notification_deliveries_environment_status_scheduled_at_idx"
ON "badge_line_notification_deliveries"("environment", "status", "scheduled_at");
CREATE INDEX "badge_line_notification_deliveries_workspace_id_group_id_status_created_at_idx"
ON "badge_line_notification_deliveries"("workspace_id", "group_id", "status", "created_at");

ALTER TABLE "badge_line_notification_deliveries" ADD CONSTRAINT "badge_line_notification_deliveries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_line_notification_deliveries" ADD CONSTRAINT "badge_line_notification_deliveries_workspace_id_group_id_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_line_notification_deliveries" ADD CONSTRAINT "badge_line_notification_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "badge_line_notification_deliveries" ADD CONSTRAINT "badge_line_notification_deliveries_badge_notification_id_fkey" FOREIGN KEY ("badge_notification_id") REFERENCES "badge_award_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
