CREATE TYPE "LineNotificationFrequency" AS ENUM ('DAILY', 'WEEKDAYS');

CREATE TABLE "line_notification_preferences" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "notification_consent_at" TIMESTAMPTZ(6),
  "local_time" VARCHAR(5) NOT NULL DEFAULT '08:00',
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Tokyo',
  "frequency" "LineNotificationFrequency" NOT NULL DEFAULT 'DAILY',
  "quiet_hours_start" VARCHAR(5) NOT NULL DEFAULT '21:00',
  "quiet_hours_end" VARCHAR(5) NOT NULL DEFAULT '07:00',
  "paused_until" TIMESTAMPTZ(6),
  "reminder_enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "line_notification_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "line_notification_preferences_consent_check" CHECK (NOT "enabled" OR "notification_consent_at" IS NOT NULL),
  CONSTRAINT "line_notification_preferences_local_time_check" CHECK ("local_time" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "line_notification_preferences_quiet_start_check" CHECK ("quiet_hours_start" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "line_notification_preferences_quiet_end_check" CHECK ("quiet_hours_end" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "line_notification_preferences_quiet_duration_check" CHECK ("quiet_hours_start" <> "quiet_hours_end")
);

CREATE UNIQUE INDEX "line_notification_preferences_workspace_id_user_id_bunshin_id_key"
  ON "line_notification_preferences"("workspace_id", "user_id", "bunshin_id");
CREATE INDEX "line_notification_preferences_workspace_id_bunshin_id_enabled_idx"
  ON "line_notification_preferences"("workspace_id", "bunshin_id", "enabled");
CREATE INDEX "line_notification_preferences_user_id_enabled_idx"
  ON "line_notification_preferences"("user_id", "enabled");

ALTER TABLE "line_notification_preferences"
  ADD CONSTRAINT "line_notification_preferences_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "line_notification_preferences"
  ADD CONSTRAINT "line_notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "line_notification_preferences"
  ADD CONSTRAINT "line_notification_preferences_workspace_id_bunshin_id_fkey"
  FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
