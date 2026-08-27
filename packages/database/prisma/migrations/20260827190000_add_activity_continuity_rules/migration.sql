CREATE TYPE "ActivityContinuityRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED');

CREATE TABLE "activity_continuity_rules" (
  "id" UUID NOT NULL,
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "ActivityContinuityRuleStatus" NOT NULL DEFAULT 'DRAFT',
  "weekly_goal" INTEGER NOT NULL,
  "dormancy_days" INTEGER NOT NULL,
  "step_building_days" INTEGER NOT NULL,
  "step_continuing_days" INTEGER NOT NULL,
  "step_established_days" INTEGER NOT NULL,
  "badge_rules" JSONB NOT NULL,
  "change_reason" VARCHAR(1000) NOT NULL,
  "activation_reason" VARCHAR(1000),
  "created_by_user_id" UUID NOT NULL,
  "activated_by_user_id" UUID,
  "activated_at" TIMESTAMPTZ(6),
  "superseded_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "activity_continuity_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_continuity_rules_creator_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "activity_continuity_rules_activator_fkey" FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "activity_continuity_rules_environment_version_key"
  ON "activity_continuity_rules"("environment", "version");
CREATE UNIQUE INDEX "activity_continuity_rules_one_active_per_environment"
  ON "activity_continuity_rules"("environment") WHERE "status" = 'ACTIVE';
CREATE INDEX "activity_continuity_rules_environment_status_created_idx"
  ON "activity_continuity_rules"("environment", "status", "created_at");

ALTER TABLE "activity_continuity_rules"
  ADD CONSTRAINT "activity_continuity_rules_weekly_goal_check" CHECK ("weekly_goal" BETWEEN 1 AND 7),
  ADD CONSTRAINT "activity_continuity_rules_dormancy_days_check" CHECK ("dormancy_days" BETWEEN 1 AND 90),
  ADD CONSTRAINT "activity_continuity_rules_steps_check" CHECK (
    "step_building_days" > 0 AND
    "step_continuing_days" > "step_building_days" AND
    "step_established_days" > "step_continuing_days"
  );
