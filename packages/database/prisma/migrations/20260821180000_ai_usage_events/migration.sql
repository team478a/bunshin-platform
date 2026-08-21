CREATE TYPE "AiUsageStatus" AS ENUM ('SUCCESS', 'FAILED');

CREATE TABLE "ai_usage_events" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "task_type" VARCHAR(80) NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "prompt_version" VARCHAR(120) NOT NULL,
  "status" "AiUsageStatus" NOT NULL,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "latency_ms" INTEGER NOT NULL,
  "estimated_cost_usd_micros" BIGINT,
  "pricing_version" VARCHAR(120),
  "error_code" VARCHAR(80),
  "idempotency_key" VARCHAR(200) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_usage_events_workspace_id_actor_user_id_idempotency_key_key"
  ON "ai_usage_events"("workspace_id", "actor_user_id", "idempotency_key");
CREATE INDEX "ai_usage_events_workspace_id_occurred_at_idx"
  ON "ai_usage_events"("workspace_id", "occurred_at");
CREATE INDEX "ai_usage_events_workspace_id_bunshin_id_task_type_occurred_at_idx"
  ON "ai_usage_events"("workspace_id", "bunshin_id", "task_type", "occurred_at");
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_workspace_id_bunshin_id_fkey"
  FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
