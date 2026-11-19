ALTER TABLE "fortune_service_settings"
  ADD COLUMN "guidance_settings" JSONB;

ALTER TABLE "fortune_participants"
  ADD COLUMN "notification_weekday" INTEGER,
  ADD COLUMN "notification_hour" INTEGER,
  ADD CONSTRAINT "fortune_participants_weekly_slot_check" CHECK (
    ("notification_weekday" IS NULL AND "notification_hour" IS NULL)
    OR
    ("notification_weekday" IS NOT NULL AND "notification_hour" IS NOT NULL
      AND "notification_weekday" BETWEEN 0 AND 6 AND "notification_hour" BETWEEN 0 AND 23)
  );
