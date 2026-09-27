ALTER TABLE "training_participant_profiles"
ADD COLUMN "work_context" JSONB NOT NULL DEFAULT '{}'::jsonb;
