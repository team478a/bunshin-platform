CREATE TYPE "ServiceLineBroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "ServiceLineBroadcastAudience" AS ENUM ('ACTIVE_PARTICIPANTS');
CREATE TYPE "ServiceLineBroadcastRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED');

CREATE TABLE "service_line_broadcasts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "message" TEXT NOT NULL,
  "audience" "ServiceLineBroadcastAudience" NOT NULL DEFAULT 'ACTIVE_PARTICIPANTS',
  "status" "ServiceLineBroadcastStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduled_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_line_broadcasts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_line_broadcasts_workspace_id_group_id_id_key" UNIQUE ("workspace_id", "group_id", "id"),
  CONSTRAINT "service_line_broadcasts_workspace_id_group_id_fkey" FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_line_broadcasts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_line_broadcasts_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "service_line_broadcasts_workspace_id_group_id_status_scheduled_at_idx" ON "service_line_broadcasts"("workspace_id", "group_id", "status", "scheduled_at");
CREATE INDEX "service_line_broadcasts_workspace_id_group_id_created_at_idx" ON "service_line_broadcasts"("workspace_id", "group_id", "created_at");

CREATE TABLE "service_line_broadcast_recipients" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "broadcast_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" "ServiceLineBroadcastRecipientStatus" NOT NULL DEFAULT 'PENDING',
  "delivered_at" TIMESTAMPTZ(6),
  "error_category" VARCHAR(80),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_line_broadcast_recipients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_line_broadcast_recipients_broadcast_id_group_membership_id_key" UNIQUE ("broadcast_id", "group_membership_id"),
  CONSTRAINT "service_line_broadcast_recipients_broadcast_fkey" FOREIGN KEY ("workspace_id", "group_id", "broadcast_id") REFERENCES "service_line_broadcasts"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_line_broadcast_recipients_membership_fkey" FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id") REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "service_line_broadcast_recipients_workspace_id_group_id_broadcast_id_status_idx" ON "service_line_broadcast_recipients"("workspace_id", "group_id", "broadcast_id", "status");
CREATE INDEX "service_line_broadcast_recipients_workspace_id_group_id_user_id_created_at_idx" ON "service_line_broadcast_recipients"("workspace_id", "group_id", "user_id", "created_at");

CREATE TABLE "service_line_broadcast_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "broadcast_id" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "before_data" JSONB,
  "after_data" JSONB NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "performed_by_user_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_line_broadcast_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_line_broadcast_audit_logs_broadcast_fkey" FOREIGN KEY ("workspace_id", "group_id", "broadcast_id") REFERENCES "service_line_broadcasts"("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "service_line_broadcast_audit_logs_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "service_line_broadcast_audit_logs_workspace_id_group_id_broadcast_id_occurred_at_idx" ON "service_line_broadcast_audit_logs"("workspace_id", "group_id", "broadcast_id", "occurred_at");
