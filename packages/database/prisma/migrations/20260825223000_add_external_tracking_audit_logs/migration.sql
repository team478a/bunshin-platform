CREATE TYPE "ExternalTrackingAuditAction" AS ENUM ('CREATED', 'UPDATED', 'ACTIVATED', 'SUSPENDED');

CREATE TABLE "external_tracking_audit_logs" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "resource_type" VARCHAR(50) NOT NULL,
  "resource_id" UUID NOT NULL,
  "action" "ExternalTrackingAuditAction" NOT NULL,
  "before_data" JSONB,
  "after_data" JSONB,
  "performed_by_user_id" UUID NOT NULL,
  "performed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_tracking_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "external_tracking_audit_logs_workspace_id_group_id_performed_at_idx" ON "external_tracking_audit_logs"("workspace_id", "group_id", "performed_at");
CREATE INDEX "external_tracking_audit_logs_resource_type_resource_id_performed_at_idx" ON "external_tracking_audit_logs"("resource_type", "resource_id", "performed_at");

ALTER TABLE "external_tracking_audit_logs" ADD CONSTRAINT "external_tracking_audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_tracking_audit_logs" ADD CONSTRAINT "external_tracking_audit_logs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_tracking_audit_logs" ADD CONSTRAINT "external_tracking_audit_logs_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
