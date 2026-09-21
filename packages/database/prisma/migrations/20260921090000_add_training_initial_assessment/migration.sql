ALTER TABLE "training_participant_profiles"
ADD COLUMN "ai_use_cases" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "work_challenges" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "preferred_topics" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "daily_minutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "learning_goal_key" VARCHAR(80),
ADD COLUMN "assessment_version" VARCHAR(80) NOT NULL DEFAULT 'AI_TRAINING_CATALOG_V1';

ALTER TABLE "training_participant_profiles"
ADD CONSTRAINT "training_participant_profiles_daily_minutes_check"
CHECK ("daily_minutes" IN (5, 10, 15));
