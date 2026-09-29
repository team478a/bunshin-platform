ALTER TABLE "service_onboarding_responses"
  ADD COLUMN "refinement_state" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "next_refinement_at" TIMESTAMPTZ(6);
