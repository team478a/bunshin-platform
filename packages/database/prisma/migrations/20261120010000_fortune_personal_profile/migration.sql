ALTER TABLE "fortune_service_settings"
  ADD COLUMN "personal_profile_enabled" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "fortune_participants"
  ADD COLUMN "profile_interest" VARCHAR(120),
  ADD COLUMN "profile_question" VARCHAR(500),
  ADD COLUMN "profile_style" VARCHAR(20),
  ADD COLUMN "profile_updated_at" TIMESTAMPTZ(6),
  ADD COLUMN "profile_consented_at" TIMESTAMPTZ(6);
