ALTER TABLE "fortune_readings"
  ADD COLUMN "pending_understanding" JSONB,
  ADD COLUMN "deep_reading" JSONB,
  ADD CONSTRAINT "fortune_readings_deep_shape_check" CHECK (
    ("pending_understanding" IS NULL OR (jsonb_typeof("pending_understanding") = 'array' AND "status" IN ('READY_BASIC', 'GENERATING')))
    AND ("deep_reading" IS NULL OR (jsonb_typeof("deep_reading") = 'object' AND "status" = 'READY_AI'))
  );
