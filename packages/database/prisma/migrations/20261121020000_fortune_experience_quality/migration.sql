ALTER TABLE "fortune_readings"
  ADD COLUMN "personal_fit_rating" VARCHAR(12),
  ADD COLUMN "personal_fit_rated_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "fortune_readings_personal_fit_check" CHECK (
    ("personal_fit_rating" IS NULL AND "personal_fit_rated_at" IS NULL)
    OR ("personal_fit_rating" IS NOT NULL
      AND "personal_fit_rating" IN ('VERY', 'SOMEWHAT', 'NOT_MUCH')
      AND "personal_fit_rated_at" IS NOT NULL)
  );

ALTER TYPE "ServiceMembershipEventType" ADD VALUE 'FORTUNE_WEEKLY_LINE_RETURN';
