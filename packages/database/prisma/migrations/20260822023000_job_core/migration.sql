CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'LEASED', 'RETRY_SCHEDULED', 'SUCCEEDED', 'DEAD', 'CANCELLED');

CREATE TABLE "jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "environment" "LineConfigurationEnvironment" NOT NULL,
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID,
  "capability_type" "CapabilityType",
  "job_type" VARCHAR(80) NOT NULL,
  "payload_reference" VARCHAR(500) NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "correlation_id" VARCHAR(120) NOT NULL,
  "requested_by" UUID NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "scheduled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "lease_owner" VARCHAR(120),
  "lease_expires_at" TIMESTAMPTZ(6),
  "next_retry_at" TIMESTAMPTZ(6),
  "last_error_category" VARCHAR(80),
  "completed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "jobs_retry_policy_check" CHECK ("attempt_count" >= 0 AND "max_attempts" > 0 AND "priority" >= 0),
  CONSTRAINT "jobs_bunshin_scope_check" CHECK ("bunshin_id" IS NOT NULL OR "capability_type" IS NULL)
);

CREATE UNIQUE INDEX "jobs_environment_idempotency_key_key" ON "jobs"("environment", "idempotency_key");
CREATE INDEX "jobs_environment_status_scheduled_at_priority_idx" ON "jobs"("environment", "status", "scheduled_at", "priority");
CREATE INDEX "jobs_environment_status_next_retry_at_priority_idx" ON "jobs"("environment", "status", "next_retry_at", "priority");
CREATE INDEX "jobs_workspace_id_bunshin_id_created_at_idx" ON "jobs"("workspace_id", "bunshin_id", "created_at");
CREATE INDEX "jobs_lease_expires_at_idx" ON "jobs"("lease_expires_at");
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_bunshin_id_fkey" FOREIGN KEY ("workspace_id", "bunshin_id") REFERENCES "bunshins"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
