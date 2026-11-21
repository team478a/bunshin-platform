ALTER TABLE "fortune_participants"
  ADD COLUMN "understanding_items" JSONB,
  ADD COLUMN "understanding_revision" UUID,
  ADD COLUMN "understanding_saved_at" TIMESTAMPTZ(6),
  ADD COLUMN "understanding_expires_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "fortune_participants_understanding_shape_check" CHECK (
    ("understanding_items" IS NULL AND "understanding_saved_at" IS NULL
      AND "understanding_expires_at" IS NULL)
    OR ("understanding_items" IS NOT NULL AND "understanding_revision" IS NOT NULL
      AND "understanding_saved_at" IS NOT NULL AND "understanding_expires_at" IS NOT NULL
      AND "understanding_expires_at" > "understanding_saved_at"
      AND jsonb_typeof("understanding_items") = 'array')
  );
