-- Additive safety ledger. No backfill, user data, production enable, or approval.
CREATE TABLE "personal_learning_call_admissions" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "service_program_id" UUID NOT NULL,
  "operation_hash" CHAR(64) NOT NULL,
  "admitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at" TIMESTAMPTZ(3),
  CONSTRAINT "personal_learning_call_admissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "personal_learning_call_admissions_scope_fkey" FOREIGN KEY ("workspace_id", "group_id", "service_program_id") REFERENCES "service_programs"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "personal_learning_call_admissions_settled_check" CHECK ("settled_at" IS NULL OR "settled_at" >= "admitted_at"),
  CONSTRAINT "personal_learning_call_admissions_hash_check" CHECK ("operation_hash" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "personal_learning_call_admissions_operation_key" ON "personal_learning_call_admissions"("workspace_id", "group_id", "service_program_id", "operation_hash");
CREATE INDEX "personal_learning_call_admissions_day_idx" ON "personal_learning_call_admissions"("workspace_id", "group_id", "service_program_id", "admitted_at");
CREATE INDEX "personal_learning_call_admissions_open_idx" ON "personal_learning_call_admissions"("workspace_id", "group_id", "service_program_id", "settled_at");
ALTER TABLE "personal_learning_call_admissions" ENABLE ROW LEVEL SECURITY;
-- No public policy: existing trusted server role only.
