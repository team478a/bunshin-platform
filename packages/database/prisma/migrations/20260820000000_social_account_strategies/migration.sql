CREATE TYPE "SocialAccountStrategyGoal" AS ENUM ('FOLLOWERS', 'LINE_REGISTRATION', 'INQUIRY', 'SALES', 'RECRUIT', 'BRAND_AWARENESS', 'BLOG_TRAFFIC', 'OTHER');
CREATE TYPE "SocialAccountStrategyDestination" AS ENUM ('PROFILE', 'LINE', 'LP', 'BLOG', 'EC', 'INQUIRY', 'RECRUIT_PAGE', 'NONE', 'OTHER');
CREATE TYPE "SocialAccountStrategyStatus" AS ENUM ('DRAFT', 'PROPOSED', 'APPROVED', 'SUPERSEDED');

CREATE UNIQUE INDEX "social_profiles_workspace_bunshin_id_platform_key" ON "social_profiles"("workspace_id", "bunshin_id", "id", "platform");

CREATE TABLE "social_account_strategies" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "social_profile_id" UUID NOT NULL,
  "platform" "SocialPlatform" NOT NULL,
  "goal" "SocialAccountStrategyGoal" NOT NULL,
  "available_minutes" INTEGER NOT NULL,
  "destination_type" "SocialAccountStrategyDestination" NOT NULL,
  "destination_detail" VARCHAR(2048),
  "concept" VARCHAR(1000) NOT NULL,
  "positioning" VARCHAR(1000) NOT NULL,
  "target_summary" VARCHAR(1000) NOT NULL,
  "profile_draft" VARCHAR(2000) NOT NULL,
  "cta_strategy" VARCHAR(1000) NOT NULL,
  "posting_policy" VARCHAR(2000) NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "SocialAccountStrategyStatus" NOT NULL DEFAULT 'DRAFT',
  "approved_at" TIMESTAMPTZ(6),
  "superseded_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "social_account_strategies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_account_strategies_available_minutes_check" CHECK ("available_minutes" IN (3, 5, 10, 20)),
  CONSTRAINT "social_account_strategies_version_check" CHECK ("version" > 0),
  CONSTRAINT "social_account_strategies_status_timestamps_check" CHECK (("status" = 'APPROVED' AND "approved_at" IS NOT NULL AND "superseded_at" IS NULL) OR ("status" = 'SUPERSEDED' AND "superseded_at" IS NOT NULL) OR ("status" IN ('DRAFT', 'PROPOSED') AND "approved_at" IS NULL AND "superseded_at" IS NULL))
);

CREATE UNIQUE INDEX "social_account_strategies_social_profile_id_version_key" ON "social_account_strategies"("social_profile_id", "version");
CREATE UNIQUE INDEX "social_account_strategies_one_approved" ON "social_account_strategies"("social_profile_id") WHERE "status" = 'APPROVED';
CREATE INDEX "social_account_strategies_scope_status_version_idx" ON "social_account_strategies"("workspace_id", "bunshin_id", "social_profile_id", "status", "version");
ALTER TABLE "social_account_strategies" ADD CONSTRAINT "social_account_strategies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_account_strategies" ADD CONSTRAINT "social_account_strategies_workspace_bunshin_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_account_strategies" ADD CONSTRAINT "social_account_strategies_profile_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "social_profile_id", "platform") REFERENCES "social_profiles"("workspace_id", "bunshin_id", "id", "platform") ON DELETE RESTRICT ON UPDATE CASCADE;
