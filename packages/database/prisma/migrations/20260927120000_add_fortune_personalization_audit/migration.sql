ALTER TABLE "fortune_readings"
ADD COLUMN "personalization_context" JSONB;

ALTER TABLE "fortune_readings"
ADD CONSTRAINT "fortune_readings_personalization_context_object_check"
CHECK (
  "personalization_context" IS NULL
  OR jsonb_typeof("personalization_context") = 'object'
);
