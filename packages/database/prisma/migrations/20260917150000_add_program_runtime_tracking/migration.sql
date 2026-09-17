CREATE TYPE "ProgramMissionAssignmentStatus" AS ENUM ('PRESENTED', 'STARTED', 'COMPLETED', 'SKIPPED');

CREATE TABLE "program_mission_assignments" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "program_enrollment_id" UUID NOT NULL,
  "program_template_version_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "route_key" VARCHAR(80) NOT NULL,
  "phase_key" VARCHAR(80) NOT NULL,
  "mission_definition_key" VARCHAR(80) NOT NULL,
  "variant_key" VARCHAR(80),
  "target_resource_type" VARCHAR(80),
  "target_resource_id" UUID,
  "status" "ProgramMissionAssignmentStatus" NOT NULL DEFAULT 'PRESENTED',
  "display_snapshot" JSONB NOT NULL,
  "rule_version" VARCHAR(80) NOT NULL,
  "presented_at" TIMESTAMPTZ(3) NOT NULL,
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "skipped_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "program_mission_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "program_mission_assignments_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "program_mission_assignments_target_check" CHECK (
    ("target_resource_type" IS NULL AND "target_resource_id" IS NULL) OR
    ("target_resource_type" IS NOT NULL AND "target_resource_id" IS NOT NULL)
  ),
  CONSTRAINT "program_mission_assignments_status_time_check" CHECK (
    ("status" = 'PRESENTED' AND "started_at" IS NULL AND "completed_at" IS NULL AND "skipped_at" IS NULL) OR
    ("status" = 'STARTED' AND "started_at" IS NOT NULL AND "completed_at" IS NULL AND "skipped_at" IS NULL) OR
    ("status" = 'COMPLETED' AND "started_at" IS NOT NULL AND "completed_at" IS NOT NULL AND "skipped_at" IS NULL) OR
    ("status" = 'SKIPPED' AND "completed_at" IS NULL AND "skipped_at" IS NOT NULL)
  ),
  CONSTRAINT "program_mission_assignments_time_order_check" CHECK (
    ("started_at" IS NULL OR "started_at" >= "presented_at") AND
    ("completed_at" IS NULL OR "started_at" IS NOT NULL AND "completed_at" >= "started_at") AND
    ("skipped_at" IS NULL OR "skipped_at" >= "presented_at")
  )
);

CREATE TABLE "program_action_events" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "program_enrollment_id" UUID NOT NULL,
  "mission_assignment_id" UUID,
  "event_type" VARCHAR(80) NOT NULL,
  "source_resource_type" VARCHAR(80),
  "source_resource_id" UUID,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB NOT NULL,
  "actor_user_id" UUID,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "program_action_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "program_action_events_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "program_action_events_source_check" CHECK (
    ("source_resource_type" IS NULL AND "source_resource_id" IS NULL) OR
    ("source_resource_type" IS NOT NULL AND "source_resource_id" IS NOT NULL)
  )
);

CREATE TABLE "program_progress_snapshots" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "program_enrollment_id" UUID NOT NULL,
  "program_template_version_id" UUID NOT NULL,
  "current_assignment_id" UUID,
  "route_key" VARCHAR(80) NOT NULL,
  "phase_key" VARCHAR(80) NOT NULL,
  "state_key" VARCHAR(80) NOT NULL,
  "bottleneck_key" VARCHAR(80),
  "completed_mission_count" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "rule_version" VARCHAR(80) NOT NULL,
  "last_action_at" TIMESTAMPTZ(3),
  "calculated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "program_progress_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "program_progress_snapshots_count_check" CHECK ("completed_mission_count" >= 0),
  CONSTRAINT "program_progress_snapshots_revision_check" CHECK ("revision" > 0)
);

CREATE UNIQUE INDEX "program_mission_assignments_enrollment_sequence_key" ON "program_mission_assignments"("program_enrollment_id", "sequence");
CREATE UNIQUE INDEX "program_mission_assignments_scope_key" ON "program_mission_assignments"("workspace_id", "group_id", "id");
CREATE INDEX "program_mission_assignments_enrollment_status_idx" ON "program_mission_assignments"("workspace_id", "group_id", "program_enrollment_id", "status", "presented_at");
CREATE INDEX "program_mission_assignments_definition_idx" ON "program_mission_assignments"("workspace_id", "program_template_version_id", "phase_key", "mission_definition_key");

CREATE UNIQUE INDEX "program_action_events_scope_key" ON "program_action_events"("workspace_id", "group_id", "id");
CREATE UNIQUE INDEX "program_action_events_idempotency_key" ON "program_action_events"("workspace_id", "group_id", "idempotency_key");
CREATE INDEX "program_action_events_enrollment_time_idx" ON "program_action_events"("workspace_id", "group_id", "program_enrollment_id", "occurred_at");
CREATE INDEX "program_action_events_assignment_type_idx" ON "program_action_events"("workspace_id", "group_id", "mission_assignment_id", "event_type");

CREATE UNIQUE INDEX "program_progress_snapshots_enrollment_key" ON "program_progress_snapshots"("program_enrollment_id");
CREATE UNIQUE INDEX "program_progress_snapshots_scope_key" ON "program_progress_snapshots"("workspace_id", "group_id", "id");
CREATE INDEX "program_progress_snapshots_phase_state_idx" ON "program_progress_snapshots"("workspace_id", "group_id", "phase_key", "state_key");

ALTER TABLE "program_mission_assignments" ADD CONSTRAINT "program_mission_assignments_enrollment_fkey" FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id") REFERENCES "program_enrollments"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_mission_assignments" ADD CONSTRAINT "program_mission_assignments_version_fkey" FOREIGN KEY ("workspace_id", "program_template_version_id") REFERENCES "program_template_versions"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "program_action_events" ADD CONSTRAINT "program_action_events_enrollment_fkey" FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id") REFERENCES "program_enrollments"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_action_events" ADD CONSTRAINT "program_action_events_assignment_fkey" FOREIGN KEY ("workspace_id", "group_id", "mission_assignment_id") REFERENCES "program_mission_assignments"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_action_events" ADD CONSTRAINT "program_action_events_actor_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "program_progress_snapshots" ADD CONSTRAINT "program_progress_snapshots_enrollment_fkey" FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id") REFERENCES "program_enrollments"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_progress_snapshots" ADD CONSTRAINT "program_progress_snapshots_version_fkey" FOREIGN KEY ("workspace_id", "program_template_version_id") REFERENCES "program_template_versions"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_progress_snapshots" ADD CONSTRAINT "program_progress_snapshots_assignment_fkey" FOREIGN KEY ("workspace_id", "group_id", "current_assignment_id") REFERENCES "program_mission_assignments"("workspace_id", "group_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "program_mission_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "program_action_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "program_progress_snapshots" ENABLE ROW LEVEL SECURITY;
