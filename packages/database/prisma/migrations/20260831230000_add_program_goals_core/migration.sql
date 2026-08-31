CREATE TYPE "ProgramPolicyStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');
CREATE TYPE "ProgramGoalMetricType" AS ENUM ('ACTION', 'TRAFFIC', 'BUSINESS');
CREATE TYPE "ProgramGoalDefinitionStatus" AS ENUM ('ACTIVE', 'RETIRED');
CREATE TYPE "ProgramMemberGoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'PAUSED', 'CANCELLED');

CREATE TABLE "service_program_support_policies" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "service_program_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "ProgramPolicyStatus" NOT NULL DEFAULT 'ACTIVE',
  "allowed_support_modes" JSONB NOT NULL,
  "default_support_mode" "ProgramSupportMode" NOT NULL,
  "member_may_choose" BOOLEAN NOT NULL DEFAULT true,
  "guidance" VARCHAR(1000) NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "superseded_at" TIMESTAMPTZ(3),
  CONSTRAINT "service_program_support_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_program_support_policies_version_check" CHECK ("version" > 0)
);

CREATE TABLE "program_member_preferences" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "program_enrollment_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "preferred_support_mode" "ProgramSupportMode" NOT NULL,
  "notes" VARCHAR(500) NOT NULL DEFAULT '',
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "program_member_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "program_goal_definitions" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "service_program_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "metric_type" "ProgramGoalMetricType" NOT NULL,
  "unit" VARCHAR(40) NOT NULL,
  "suggested_target" DECIMAL(18,2),
  "status" "ProgramGoalDefinitionStatus" NOT NULL DEFAULT 'ACTIVE',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "program_goal_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "program_goal_definitions_target_check" CHECK ("suggested_target" IS NULL OR "suggested_target" > 0)
);

CREATE TABLE "program_member_goals" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "program_enrollment_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "goal_definition_id" UUID,
  "title" VARCHAR(160) NOT NULL,
  "metric_type" "ProgramGoalMetricType" NOT NULL,
  "target_value" DECIMAL(18,2) NOT NULL,
  "current_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "unit" VARCHAR(40) NOT NULL,
  "status" "ProgramMemberGoalStatus" NOT NULL DEFAULT 'ACTIVE',
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "due_at" TIMESTAMPTZ(3),
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "program_member_goals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "program_member_goals_target_check" CHECK ("target_value" > 0),
  CONSTRAINT "program_member_goals_progress_check" CHECK ("current_value" >= 0),
  CONSTRAINT "program_member_goals_period_check" CHECK ("due_at" IS NULL OR "starts_at" < "due_at")
);

CREATE UNIQUE INDEX "service_program_support_policies_program_version_key" ON "service_program_support_policies"("service_program_id", "version");
CREATE UNIQUE INDEX "service_program_support_policies_scope_key" ON "service_program_support_policies"("workspace_id", "group_id", "id");
CREATE UNIQUE INDEX "service_program_support_policies_active_key" ON "service_program_support_policies"("workspace_id", "group_id", "service_program_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "service_program_support_policies_scope_idx" ON "service_program_support_policies"("workspace_id", "group_id", "service_program_id", "status");
CREATE UNIQUE INDEX "program_member_preferences_enrollment_key" ON "program_member_preferences"("program_enrollment_id");
CREATE UNIQUE INDEX "program_member_preferences_scope_key" ON "program_member_preferences"("workspace_id", "group_id", "id");
CREATE INDEX "program_member_preferences_member_idx" ON "program_member_preferences"("workspace_id", "group_id", "group_membership_id");
CREATE UNIQUE INDEX "program_goal_definitions_scope_key" ON "program_goal_definitions"("workspace_id", "group_id", "id");
CREATE INDEX "program_goal_definitions_scope_idx" ON "program_goal_definitions"("workspace_id", "group_id", "service_program_id", "status", "sort_order");
CREATE UNIQUE INDEX "program_member_goals_scope_key" ON "program_member_goals"("workspace_id", "group_id", "id");
CREATE UNIQUE INDEX "program_member_goals_active_key" ON "program_member_goals"("workspace_id", "group_id", "program_enrollment_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "program_member_goals_member_idx" ON "program_member_goals"("workspace_id", "group_id", "group_membership_id", "status");
CREATE INDEX "program_member_goals_enrollment_idx" ON "program_member_goals"("workspace_id", "group_id", "program_enrollment_id");

ALTER TABLE "service_program_support_policies" ADD CONSTRAINT "service_program_support_policies_program_fkey" FOREIGN KEY ("workspace_id", "group_id", "service_program_id") REFERENCES "service_programs"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_member_preferences" ADD CONSTRAINT "program_member_preferences_enrollment_fkey" FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id") REFERENCES "program_enrollments"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_member_preferences" ADD CONSTRAINT "program_member_preferences_membership_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_goal_definitions" ADD CONSTRAINT "program_goal_definitions_program_fkey" FOREIGN KEY ("workspace_id", "group_id", "service_program_id") REFERENCES "service_programs"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_member_goals" ADD CONSTRAINT "program_member_goals_enrollment_fkey" FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id") REFERENCES "program_enrollments"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_member_goals" ADD CONSTRAINT "program_member_goals_membership_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_member_goals" ADD CONSTRAINT "program_member_goals_definition_fkey" FOREIGN KEY ("workspace_id", "group_id", "goal_definition_id") REFERENCES "program_goal_definitions"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
