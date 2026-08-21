CREATE TABLE "daily_mission_generations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "mission_date" DATE NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "daily_mission_id" UUID,
  "error_category" VARCHAR(80),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_mission_generations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_mission_generations_workspace_id_bunshin_id_mission_date_key"
  ON "daily_mission_generations"("workspace_id", "bunshin_id", "mission_date");
CREATE UNIQUE INDEX "daily_mission_generations_workspace_id_bunshin_id_actor_user_id_idempotency_key_key"
  ON "daily_mission_generations"("workspace_id", "bunshin_id", "actor_user_id", "idempotency_key");
CREATE INDEX "daily_mission_generations_workspace_id_bunshin_id_status_updated_at_idx"
  ON "daily_mission_generations"("workspace_id", "bunshin_id", "status", "updated_at");
