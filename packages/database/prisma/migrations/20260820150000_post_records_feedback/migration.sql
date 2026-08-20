ALTER TYPE "MissionActivityType" ADD VALUE 'POSTED';
ALTER TYPE "MissionActivityType" ADD VALUE 'FEEDBACK_GOOD';
ALTER TYPE "MissionActivityType" ADD VALUE 'FEEDBACK_NEUTRAL';
ALTER TYPE "MissionActivityType" ADD VALUE 'FEEDBACK_BAD';

CREATE TYPE "PostSource" AS ENUM ('MANUAL');
CREATE TYPE "MissionFeedbackRating" AS ENUM ('GOOD', 'NEUTRAL', 'BAD');

CREATE TABLE "post_records" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "daily_mission_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "platform" "SocialPlatform" NOT NULL,
  "posted_at" TIMESTAMPTZ(6) NOT NULL,
  "post_url" VARCHAR(2048),
  "external_post_id" VARCHAR(255),
  "source" "PostSource" NOT NULL DEFAULT 'MANUAL',
  "manual_metrics" JSONB,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "post_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mission_feedback" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "daily_mission_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "rating" "MissionFeedbackRating" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "mission_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_records_daily_mission_id_key" ON "post_records"("daily_mission_id");
CREATE UNIQUE INDEX "post_records_workspace_id_bunshin_id_daily_mission_id_key" ON "post_records"("workspace_id", "bunshin_id", "daily_mission_id");
CREATE UNIQUE INDEX "post_records_workspace_id_bunshin_id_actor_user_id_idemp_key" ON "post_records"("workspace_id", "bunshin_id", "actor_user_id", "idempotency_key");
CREATE INDEX "post_records_workspace_id_bunshin_id_posted_at_idx" ON "post_records"("workspace_id", "bunshin_id", "posted_at");
CREATE INDEX "post_records_actor_user_id_posted_at_idx" ON "post_records"("actor_user_id", "posted_at");
CREATE UNIQUE INDEX "mission_feedback_daily_mission_id_key" ON "mission_feedback"("daily_mission_id");
CREATE UNIQUE INDEX "mission_feedback_workspace_id_bunshin_id_daily_mission_id_key" ON "mission_feedback"("workspace_id", "bunshin_id", "daily_mission_id");
CREATE INDEX "mission_feedback_workspace_id_bunshin_id_rating_updated_at_idx" ON "mission_feedback"("workspace_id", "bunshin_id", "rating", "updated_at");
CREATE INDEX "mission_feedback_actor_user_id_updated_at_idx" ON "mission_feedback"("actor_user_id", "updated_at");

ALTER TABLE "post_records" ADD CONSTRAINT "post_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "post_records" ADD CONSTRAINT "post_records_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "post_records" ADD CONSTRAINT "post_records_workspace_id_bunshin_id_daily_mission_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_records" ADD CONSTRAINT "post_records_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mission_feedback" ADD CONSTRAINT "mission_feedback_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mission_feedback" ADD CONSTRAINT "mission_feedback_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mission_feedback" ADD CONSTRAINT "mission_feedback_workspace_id_bunshin_id_daily_mission_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mission_feedback" ADD CONSTRAINT "mission_feedback_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
