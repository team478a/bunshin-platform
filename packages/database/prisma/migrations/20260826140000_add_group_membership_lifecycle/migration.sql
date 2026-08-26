ALTER TYPE "GroupMembershipStatus" ADD VALUE 'SUSPENDED';

CREATE TYPE "GroupMembershipAuditAction" AS ENUM (
  'ROLE_CHANGED',
  'SUSPENDED',
  'REACTIVATED',
  'REVOKED'
);

CREATE TABLE "group_membership_audit_logs" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID,
  "action" "GroupMembershipAuditAction" NOT NULL,
  "before_data" JSONB NOT NULL,
  "after_data" JSONB NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "performed_by_user_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_membership_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "group_membership_audit_logs_workspace_id_group_id_occurred_idx"
  ON "group_membership_audit_logs"("workspace_id", "group_id", "occurred_at");
CREATE INDEX "group_membership_audit_logs_group_membership_id_occurred_at_idx"
  ON "group_membership_audit_logs"("group_membership_id", "occurred_at");

ALTER TABLE "group_membership_audit_logs"
  ADD CONSTRAINT "group_membership_audit_logs_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_membership_audit_logs"
  ADD CONSTRAINT "group_membership_audit_logs_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_membership_audit_logs"
  ADD CONSTRAINT "group_membership_audit_logs_group_membership_id_fkey"
  FOREIGN KEY ("group_membership_id") REFERENCES "group_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "group_membership_audit_logs"
  ADD CONSTRAINT "group_membership_audit_logs_performed_by_user_id_fkey"
  FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
