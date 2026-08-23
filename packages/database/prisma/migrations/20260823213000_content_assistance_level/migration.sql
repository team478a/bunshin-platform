CREATE TYPE "ContentAssistanceLevel" AS ENUM ('IDEA_ONLY', 'GUIDED', 'READY_TO_USE');

ALTER TABLE "social_profiles"
ADD COLUMN "default_assistance_level" "ContentAssistanceLevel" NOT NULL DEFAULT 'READY_TO_USE';

ALTER TABLE "daily_missions"
ADD COLUMN "assistance_level" "ContentAssistanceLevel" NOT NULL DEFAULT 'READY_TO_USE';
