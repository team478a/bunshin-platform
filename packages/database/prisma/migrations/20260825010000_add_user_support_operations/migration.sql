CREATE TYPE "UserOperationAuditAction" AS ENUM ('SUSPENDED', 'REACTIVATED');
CREATE TYPE "SupportCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');
CREATE TYPE "SupportCasePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TABLE "user_operation_audits" (
  "id" UUID NOT NULL,
  "target_user_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "action" "UserOperationAuditAction" NOT NULL,
  "previous_status" "UserStatus" NOT NULL,
  "next_status" "UserStatus" NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_operation_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_operation_audits_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "user_operation_audits_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "support_cases" (
  "id" UUID NOT NULL,
  "target_user_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "assignee_user_id" UUID,
  "subject" VARCHAR(200) NOT NULL,
  "status" "SupportCaseStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "SupportCasePriority" NOT NULL DEFAULT 'NORMAL',
  "resolved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "support_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_cases_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "support_cases_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "support_cases_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "support_case_notes" (
  "id" UUID NOT NULL,
  "support_case_id" UUID NOT NULL,
  "author_user_id" UUID NOT NULL,
  "content" VARCHAR(2000) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_case_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_case_notes_support_case_id_fkey" FOREIGN KEY ("support_case_id") REFERENCES "support_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "support_case_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "user_operation_audits_target_user_id_occurred_at_idx" ON "user_operation_audits"("target_user_id", "occurred_at");
CREATE INDEX "user_operation_audits_actor_user_id_occurred_at_idx" ON "user_operation_audits"("actor_user_id", "occurred_at");
CREATE INDEX "support_cases_target_user_id_status_updated_at_idx" ON "support_cases"("target_user_id", "status", "updated_at");
CREATE INDEX "support_cases_assignee_user_id_status_updated_at_idx" ON "support_cases"("assignee_user_id", "status", "updated_at");
CREATE INDEX "support_case_notes_support_case_id_created_at_idx" ON "support_case_notes"("support_case_id", "created_at");
