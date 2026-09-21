ALTER TABLE "training_participant_profiles"
ADD COLUMN "skill_scores" JSONB NOT NULL DEFAULT '{}';
