CREATE TYPE "MissionDecisionValue" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TYPE "MissionRejectionReason" AS ENUM ('NOT_MY_STYLE', 'WRONG_TOPIC', 'TOO_DIFFICULT', 'TOO_MUCH_WORK', 'SIMILAR_TO_PAST', 'TOO_SALESY', 'NOT_TODAY', 'OTHER');
CREATE TYPE "MissionActivityType" AS ENUM ('VIEWED', 'ACCEPTED', 'REJECTED', 'COPIED_TEXT', 'COPIED_SLIDE', 'COPIED_VIDEO_PROMPT', 'COPIED_SCRIPT');

CREATE TABLE "mission_decisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "daily_mission_id" UUID NOT NULL,
  "decision" "MissionDecisionValue" NOT NULL DEFAULT 'PENDING',
  "rejection_reason" "MissionRejectionReason",
  "rejection_detail" VARCHAR(1000),
  "decided_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mission_decisions_pkey" PRIMARY KEY ("id")
);

INSERT INTO "mission_decisions" (
  "workspace_id", "bunshin_id", "daily_mission_id", "decision"
)
SELECT "workspace_id", "bunshin_id", "id", 'PENDING'::"MissionDecisionValue"
FROM "daily_missions";

CREATE UNIQUE INDEX "mission_decisions_daily_mission_id_key" ON "mission_decisions"("daily_mission_id");
CREATE UNIQUE INDEX "mission_decisions_workspace_id_bunshin_id_daily_mission_id_key" ON "mission_decisions"("workspace_id", "bunshin_id", "daily_mission_id");
CREATE INDEX "mission_decisions_workspace_id_bunshin_id_decision_idx" ON "mission_decisions"("workspace_id", "bunshin_id", "decision");

ALTER TABLE "mission_decisions" ADD CONSTRAINT "mission_decisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mission_decisions" ADD CONSTRAINT "mission_decisions_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mission_decisions" ADD CONSTRAINT "mission_decisions_workspace_id_bunshin_id_daily_mission_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mission_activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "daily_mission_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "type" "MissionActivityType" NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mission_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mission_activities_workspace_id_bunshin_id_actor_user_id_idempotency_key_key" ON "mission_activities"("workspace_id", "bunshin_id", "actor_user_id", "idempotency_key");
CREATE INDEX "mission_activities_workspace_id_bunshin_id_daily_mission_id_occurred_at_idx" ON "mission_activities"("workspace_id", "bunshin_id", "daily_mission_id", "occurred_at");
CREATE INDEX "mission_activities_actor_user_id_occurred_at_idx" ON "mission_activities"("actor_user_id", "occurred_at");

ALTER TABLE "mission_activities" ADD CONSTRAINT "mission_activities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mission_activities" ADD CONSTRAINT "mission_activities_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mission_activities" ADD CONSTRAINT "mission_activities_workspace_id_bunshin_id_daily_mission_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mission_activities" ADD CONSTRAINT "mission_activities_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
