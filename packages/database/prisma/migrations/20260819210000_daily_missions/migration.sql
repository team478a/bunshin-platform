CREATE TYPE "DailyMissionStatus" AS ENUM ('GENERATED', 'VIEWED', 'STARTED', 'COMPLETED', 'SKIPPED', 'EXPIRED');

CREATE UNIQUE INDEX "social_profiles_workspace_id_bunshin_id_id_key"
  ON "social_profiles"("workspace_id", "bunshin_id", "id");
CREATE UNIQUE INDEX "weekly_plan_items_workspace_id_bunshin_id_id_key"
  ON "weekly_plan_items"("workspace_id", "bunshin_id", "id");

CREATE TABLE "daily_missions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "social_profile_id" UUID,
  "weekly_plan_item_id" UUID,
  "mission_date" DATE NOT NULL,
  "status" "DailyMissionStatus" NOT NULL DEFAULT 'GENERATED',
  "format" "SocialPreferredFormat" NOT NULL,
  "estimated_minutes" INTEGER NOT NULL,
  "topic" VARCHAR(200) NOT NULL,
  "angle" VARCHAR(500) NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "quality_score" INTEGER,
  "viewed_at" TIMESTAMPTZ(6),
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "skipped_at" TIMESTAMPTZ(6),
  "expired_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "daily_missions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_missions_estimated_minutes_check" CHECK ("estimated_minutes" BETWEEN 1 AND 120),
  CONSTRAINT "daily_missions_quality_score_check" CHECK ("quality_score" IS NULL OR "quality_score" BETWEEN 0 AND 100)
);

CREATE TABLE "mission_contents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "daily_mission_id" UUID NOT NULL,
  "format" "SocialPreferredFormat" NOT NULL,
  "content_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "mission_contents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_missions_workspace_id_bunshin_id_mission_date_key" ON "daily_missions"("workspace_id", "bunshin_id", "mission_date");
CREATE UNIQUE INDEX "daily_missions_workspace_id_bunshin_id_id_key" ON "daily_missions"("workspace_id", "bunshin_id", "id");
CREATE UNIQUE INDEX "daily_missions_workspace_id_bunshin_id_id_format_key" ON "daily_missions"("workspace_id", "bunshin_id", "id", "format");
CREATE INDEX "daily_missions_workspace_id_bunshin_id_status_mission_date_idx" ON "daily_missions"("workspace_id", "bunshin_id", "status", "mission_date");
CREATE INDEX "daily_missions_social_profile_id_idx" ON "daily_missions"("social_profile_id");
CREATE INDEX "daily_missions_weekly_plan_item_id_idx" ON "daily_missions"("weekly_plan_item_id");
CREATE UNIQUE INDEX "mission_contents_daily_mission_id_key" ON "mission_contents"("daily_mission_id");
CREATE UNIQUE INDEX "mission_contents_workspace_id_bunshin_id_daily_mission_id_key" ON "mission_contents"("workspace_id", "bunshin_id", "daily_mission_id");
CREATE UNIQUE INDEX "mission_contents_workspace_id_bunshin_id_daily_mission_id_format_key" ON "mission_contents"("workspace_id", "bunshin_id", "daily_mission_id", "format");
CREATE INDEX "mission_contents_workspace_id_bunshin_id_format_idx" ON "mission_contents"("workspace_id", "bunshin_id", "format");

ALTER TABLE "daily_missions" ADD CONSTRAINT "daily_missions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_missions" ADD CONSTRAINT "daily_missions_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_missions" ADD CONSTRAINT "daily_missions_workspace_id_bunshin_id_social_profile_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "social_profile_id") REFERENCES "social_profiles"("workspace_id", "bunshin_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_missions" ADD CONSTRAINT "daily_missions_workspace_id_bunshin_id_weekly_plan_item_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "weekly_plan_item_id") REFERENCES "weekly_plan_items"("workspace_id", "bunshin_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mission_contents" ADD CONSTRAINT "mission_contents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mission_contents" ADD CONSTRAINT "mission_contents_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mission_contents" ADD CONSTRAINT "mission_contents_workspace_id_bunshin_id_daily_mission_id_format_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id", "format") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id", "format") ON DELETE CASCADE ON UPDATE CASCADE;
