ALTER TABLE "user_registration_profiles"
  ADD COLUMN "first_post_suggestion" JSONB,
  ADD COLUMN "first_post_generated_at" TIMESTAMPTZ(6);

ALTER TABLE "service_line_broadcasts"
  ADD COLUMN "segment_criteria" JSONB NOT NULL DEFAULT '{}';
