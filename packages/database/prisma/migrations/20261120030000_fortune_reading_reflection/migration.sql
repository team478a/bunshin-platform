ALTER TABLE "fortune_service_settings"
  ADD COLUMN "reflection_enabled" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "fortune_readings"
  ADD COLUMN "reflection_prompt" VARCHAR(200),
  ADD COLUMN "reflection_answer" VARCHAR(24),
  ADD CONSTRAINT "fortune_readings_reflection_answer_check"
    CHECK ("reflection_answer" IN ('TRIED_CHANGED', 'TRIED_NO_CHANGE', 'NOT_TRIED'));
