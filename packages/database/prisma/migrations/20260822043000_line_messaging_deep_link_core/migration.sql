CREATE TYPE "LineMessageDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "LineMessageAttemptStatus" AS ENUM ('SUCCESS', 'FAILED');
CREATE TYPE "LineMessageKind" AS ENUM ('DAILY_MISSION', 'REMINDER');

CREATE TABLE "line_message_deliveries" (
  "id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "daily_mission_id" UUID NOT NULL,
  "kind" "LineMessageKind" NOT NULL DEFAULT 'DAILY_MISSION',
  "status" "LineMessageDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "idempotency_key" VARCHAR(200) NOT NULL,
  "scheduled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "last_error_category" VARCHAR(80),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "line_message_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "line_message_delivery_attempts" (
  "id" UUID NOT NULL,
  "delivery_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "status" "LineMessageAttemptStatus" NOT NULL,
  "error_category" VARCHAR(80),
  "latency_ms" INTEGER NOT NULL,
  "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "line_message_delivery_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mission_deep_link_states" (
  "id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "daily_mission_id" UUID NOT NULL,
  "key_version" INTEGER NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mission_deep_link_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "line_message_deliveries_environment_idempotency_key_key" ON "line_message_deliveries"("environment", "idempotency_key");
CREATE UNIQUE INDEX "line_message_deliveries_environment_user_id_daily_mission_id_kind_key" ON "line_message_deliveries"("environment", "user_id", "daily_mission_id", "kind");
CREATE INDEX "line_message_deliveries_environment_status_scheduled_at_idx" ON "line_message_deliveries"("environment", "status", "scheduled_at");
CREATE INDEX "line_message_deliveries_workspace_id_bunshin_id_created_at_idx" ON "line_message_deliveries"("workspace_id", "bunshin_id", "created_at");
CREATE UNIQUE INDEX "line_message_delivery_attempts_delivery_id_attempt_number_key" ON "line_message_delivery_attempts"("delivery_id", "attempt_number");
CREATE INDEX "line_message_delivery_attempts_status_attempted_at_idx" ON "line_message_delivery_attempts"("status", "attempted_at");
CREATE INDEX "mission_deep_link_states_environment_expires_at_consumed_at_idx" ON "mission_deep_link_states"("environment", "expires_at", "consumed_at");
CREATE INDEX "mission_deep_link_states_workspace_id_user_id_created_at_idx" ON "mission_deep_link_states"("workspace_id", "user_id", "created_at");

ALTER TABLE "line_message_deliveries" ADD CONSTRAINT "line_message_deliveries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "line_message_deliveries" ADD CONSTRAINT "line_message_deliveries_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "line_message_deliveries" ADD CONSTRAINT "line_message_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "line_message_deliveries" ADD CONSTRAINT "line_message_deliveries_workspace_id_bunshin_id_daily_mission_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "line_message_delivery_attempts" ADD CONSTRAINT "line_message_delivery_attempts_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "line_message_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mission_deep_link_states" ADD CONSTRAINT "mission_deep_link_states_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mission_deep_link_states" ADD CONSTRAINT "mission_deep_link_states_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mission_deep_link_states" ADD CONSTRAINT "mission_deep_link_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mission_deep_link_states" ADD CONSTRAINT "mission_deep_link_states_workspace_id_bunshin_id_daily_mission_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id") REFERENCES "daily_missions"("workspace_id", "bunshin_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "line_message_delivery_attempts" ADD CONSTRAINT "line_message_delivery_attempts_attempt_number_check" CHECK ("attempt_number" > 0);
ALTER TABLE "line_message_delivery_attempts" ADD CONSTRAINT "line_message_delivery_attempts_latency_check" CHECK ("latency_ms" >= 0);
ALTER TABLE "line_message_delivery_attempts" ADD CONSTRAINT "line_message_delivery_attempts_result_check" CHECK (("status" = 'SUCCESS' AND "error_category" IS NULL) OR ("status" = 'FAILED' AND "error_category" IS NOT NULL));
ALTER TABLE "mission_deep_link_states" ADD CONSTRAINT "mission_deep_link_states_key_version_check" CHECK ("key_version" > 0);
