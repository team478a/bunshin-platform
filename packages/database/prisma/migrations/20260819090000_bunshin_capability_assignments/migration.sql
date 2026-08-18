CREATE TYPE "CapabilityType" AS ENUM ('SOCIAL','BLOG','LINE_MARKETING','LP','LEAD_GENERATION','SALES','CUSTOMER_SUPPORT');
CREATE TYPE "CapabilityAssignmentStatus" AS ENUM ('ACTIVE','SUSPENDED','LOCKED');

CREATE TABLE "bunshin_capability_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "bunshin_id" UUID NOT NULL,
  "capability_type" "CapabilityType" NOT NULL,
  "status" "CapabilityAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "config" JSONB NOT NULL DEFAULT '{}',
  "assigned_by_user_id" UUID NOT NULL,
  "activated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "bunshin_capability_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bunshin_capability_assignments_workspace_id_bunshin_id_capability_type_key" ON "bunshin_capability_assignments"("workspace_id","bunshin_id","capability_type");
CREATE INDEX "bunshin_capability_assignments_workspace_id_bunshin_id_status_updated_at_idx" ON "bunshin_capability_assignments"("workspace_id","bunshin_id","status","updated_at");

ALTER TABLE "bunshin_capability_assignments" ADD CONSTRAINT "bunshin_capability_assignments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bunshin_capability_assignments" ADD CONSTRAINT "bunshin_capability_assignments_bunshin_id_fkey" FOREIGN KEY ("bunshin_id") REFERENCES "bunshins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bunshin_capability_assignments" ADD CONSTRAINT "bunshin_capability_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
