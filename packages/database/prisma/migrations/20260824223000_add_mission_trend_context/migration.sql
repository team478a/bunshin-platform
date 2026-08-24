CREATE TABLE "mission_trend_contexts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "bunshin_id" UUID NOT NULL,
    "daily_mission_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mission_trend_contexts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mission_trend_contexts_daily_mission_id_key"
ON "mission_trend_contexts"("daily_mission_id");

CREATE UNIQUE INDEX "mission_trend_contexts_workspace_id_bunshin_id_daily_mission_id_key"
ON "mission_trend_contexts"("workspace_id", "bunshin_id", "daily_mission_id");

CREATE INDEX "mission_trend_contexts_workspace_id_bunshin_id_candidate_id_idx"
ON "mission_trend_contexts"("workspace_id", "bunshin_id", "candidate_id");

ALTER TABLE "mission_trend_contexts"
ADD CONSTRAINT "mission_trend_contexts_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mission_trend_contexts"
ADD CONSTRAINT "mission_trend_contexts_workspace_id_bunshin_id_fkey"
FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mission_trend_contexts"
ADD CONSTRAINT "mission_trend_contexts_workspace_id_bunshin_id_daily_mission_id_fkey"
FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mission_trend_contexts"
ADD CONSTRAINT "mission_trend_contexts_workspace_id_bunshin_id_candidate_id_fkey"
FOREIGN KEY ("workspace_id", "bunshin_id", "candidate_id") REFERENCES "trend_idea_candidates"("workspace_id", "bunshin_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
