CREATE TABLE "badge_award_notifications" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "badge_award_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "badge_award_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "badge_award_notifications_badge_award_id_key"
ON "badge_award_notifications"("badge_award_id");

CREATE UNIQUE INDEX "badge_award_notifications_workspace_id_user_id_badge_award_id_key"
ON "badge_award_notifications"("workspace_id", "user_id", "badge_award_id");

CREATE INDEX "badge_award_notifications_workspace_id_user_id_read_at_created_at_idx"
ON "badge_award_notifications"("workspace_id", "user_id", "read_at", "created_at");

ALTER TABLE "badge_award_notifications"
ADD CONSTRAINT "badge_award_notifications_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "badge_award_notifications"
ADD CONSTRAINT "badge_award_notifications_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "badge_award_notifications"
ADD CONSTRAINT "badge_award_notifications_workspace_id_user_id_badge_award_id_fkey"
FOREIGN KEY ("workspace_id", "user_id", "badge_award_id")
REFERENCES "badge_awards"("workspace_id", "user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
