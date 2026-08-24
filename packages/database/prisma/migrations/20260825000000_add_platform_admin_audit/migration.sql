CREATE TYPE "PlatformAdminAuditAction" AS ENUM ('GRANTED', 'ROLE_CHANGED', 'REACTIVATED', 'REVOKED');

CREATE TABLE "platform_admin_audits" (
  "id" UUID NOT NULL,
  "target_user_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "action" "PlatformAdminAuditAction" NOT NULL,
  "previous_role" "PlatformRole",
  "next_role" "PlatformRole",
  "previous_status" "PlatformAdminStatus",
  "next_status" "PlatformAdminStatus",
  "reason" VARCHAR(1000) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_admin_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_admin_audits_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_admin_audits_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "platform_admin_audits_target_user_id_occurred_at_idx" ON "platform_admin_audits"("target_user_id", "occurred_at");
CREATE INDEX "platform_admin_audits_actor_user_id_occurred_at_idx" ON "platform_admin_audits"("actor_user_id", "occurred_at");
