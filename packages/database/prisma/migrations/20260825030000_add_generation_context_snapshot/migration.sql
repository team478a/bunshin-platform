CREATE TABLE "generation_context_snapshots" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "bunshin_id" UUID NOT NULL,
    "daily_mission_id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_context_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "generation_context_snapshots_daily_mission_id_key"
ON "generation_context_snapshots"("daily_mission_id");

CREATE UNIQUE INDEX "generation_context_snapshots_workspace_id_bunshin_id_daily_mission_id_key"
ON "generation_context_snapshots"("workspace_id", "bunshin_id", "daily_mission_id");

CREATE INDEX "generation_context_snapshots_workspace_id_bunshin_id_generated_at_idx"
ON "generation_context_snapshots"("workspace_id", "bunshin_id", "generated_at");

ALTER TABLE "generation_context_snapshots"
ADD CONSTRAINT "generation_context_snapshots_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "generation_context_snapshots"
ADD CONSTRAINT "generation_context_snapshots_workspace_id_bunshin_id_fkey"
FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "generation_context_snapshots"
ADD CONSTRAINT "generation_context_snapshots_workspace_id_bunshin_id_daily_mission_id_fkey"
FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
