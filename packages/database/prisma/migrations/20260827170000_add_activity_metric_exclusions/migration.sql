CREATE TYPE "ActivityMetricExclusionAction" AS ENUM ('EXCLUDED', 'INCLUDED');

CREATE TABLE "activity_metric_exclusions" (
  "id" UUID NOT NULL,
  "target_user_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "action" "ActivityMetricExclusionAction" NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_metric_exclusions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_metric_exclusions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "activity_metric_exclusions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE INDEX "activity_metric_exclusions_target_environment_occurred_idx"
  ON "activity_metric_exclusions"("target_user_id", "environment", "occurred_at");
CREATE INDEX "activity_metric_exclusions_actor_occurred_idx"
  ON "activity_metric_exclusions"("actor_user_id", "occurred_at");
