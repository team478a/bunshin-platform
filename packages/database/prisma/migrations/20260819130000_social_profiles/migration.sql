CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM','TIKTOK','X','OTHER');
CREATE TYPE "SocialPostingFrequency" AS ENUM ('DAILY','WEEKDAYS','THREE_PER_WEEK','WEEKLY','FLEXIBLE');
CREATE TYPE "SocialProfileStatus" AS ENUM ('ACTIVE','INACTIVE');

CREATE UNIQUE INDEX "bunshins_workspace_id_id_key" ON "bunshins"("workspace_id","id");

CREATE TABLE "social_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "platform" "SocialPlatform" NOT NULL,
  "handle" VARCHAR(100),
  "profile_url" VARCHAR(2048),
  "purpose" VARCHAR(500) NOT NULL,
  "posting_frequency" "SocialPostingFrequency" NOT NULL,
  "preferred_formats" JSONB NOT NULL,
  "status" "SocialProfileStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "social_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "social_profiles_workspace_id_bunshin_id_platform_key" ON "social_profiles"("workspace_id","bunshin_id","platform");
CREATE INDEX "social_profiles_workspace_id_bunshin_id_status_updated_at_idx" ON "social_profiles"("workspace_id","bunshin_id","status","updated_at");

ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id","bunshin_id") REFERENCES "bunshins"("workspace_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
