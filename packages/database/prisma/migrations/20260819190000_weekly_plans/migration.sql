CREATE TYPE "WeeklyPlanStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'EXPIRED');
CREATE TYPE "SocialPreferredFormat" AS ENUM ('SLIDE', 'LIVE_ACTION', 'AI_VIDEO_PROMPT', 'IMAGE');

CREATE TABLE "weekly_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "workspace_id" UUID NOT NULL, "bunshin_id" UUID NOT NULL,
  "week_start_date" DATE NOT NULL, "timezone" VARCHAR(64) NOT NULL, "strategy_summary" VARCHAR(1000),
  "status" "WeeklyPlanStatus" NOT NULL DEFAULT 'DRAFT', "confirmed_at" TIMESTAMPTZ(6), "expired_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "weekly_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "weekly_plans_status_timestamps_check" CHECK (
    ("status" = 'DRAFT' AND "confirmed_at" IS NULL AND "expired_at" IS NULL) OR
    ("status" = 'CONFIRMED' AND "confirmed_at" IS NOT NULL AND "expired_at" IS NULL) OR
    ("status" = 'EXPIRED' AND "expired_at" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "weekly_plans_workspace_id_bunshin_id_week_start_date_key" ON "weekly_plans"("workspace_id","bunshin_id","week_start_date");
CREATE UNIQUE INDEX "weekly_plans_workspace_id_bunshin_id_id_key" ON "weekly_plans"("workspace_id","bunshin_id","id");
CREATE INDEX "weekly_plans_workspace_id_bunshin_id_status_week_start_date_idx" ON "weekly_plans"("workspace_id","bunshin_id","status","week_start_date");
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id","bunshin_id") REFERENCES "bunshins"("workspace_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "content_pillars_workspace_id_bunshin_id_id_key" ON "content_pillars"("workspace_id","bunshin_id","id");

CREATE TABLE "weekly_plan_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "workspace_id" UUID NOT NULL, "bunshin_id" UUID NOT NULL,
  "weekly_plan_id" UUID NOT NULL, "scheduled_date" DATE NOT NULL, "content_pillar_id" UUID NOT NULL,
  "goal" VARCHAR(200) NOT NULL, "angle" VARCHAR(500) NOT NULL, "recommended_format" "SocialPreferredFormat" NOT NULL,
  "notes" VARCHAR(1000), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "weekly_plan_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "weekly_plan_items_weekly_plan_id_scheduled_date_key" ON "weekly_plan_items"("weekly_plan_id","scheduled_date");
CREATE INDEX "weekly_plan_items_workspace_id_bunshin_id_scheduled_date_idx" ON "weekly_plan_items"("workspace_id","bunshin_id","scheduled_date");
CREATE INDEX "weekly_plan_items_content_pillar_id_idx" ON "weekly_plan_items"("content_pillar_id");
ALTER TABLE "weekly_plan_items" ADD CONSTRAINT "weekly_plan_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weekly_plan_items" ADD CONSTRAINT "weekly_plan_items_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id","bunshin_id") REFERENCES "bunshins"("workspace_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weekly_plan_items" ADD CONSTRAINT "weekly_plan_items_workspace_id_bunshin_id_weekly_plan_id_fkey" FOREIGN KEY ("workspace_id","bunshin_id","weekly_plan_id") REFERENCES "weekly_plans"("workspace_id","bunshin_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weekly_plan_items" ADD CONSTRAINT "weekly_plan_items_workspace_id_bunshin_id_content_pillar_id_fkey" FOREIGN KEY ("workspace_id","bunshin_id","content_pillar_id") REFERENCES "content_pillars"("workspace_id","bunshin_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
