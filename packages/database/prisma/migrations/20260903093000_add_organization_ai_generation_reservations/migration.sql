CREATE TYPE "OrganizationAiReservationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

CREATE TABLE "organization_ai_generation_reservations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "month_key" CHAR(7) NOT NULL,
    "operation_key" VARCHAR(200) NOT NULL,
    "status" "OrganizationAiReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "released_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "organization_ai_generation_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_ai_generation_reservations_workspace_id_operation_key_key"
ON "organization_ai_generation_reservations"("workspace_id", "operation_key");

CREATE INDEX "organization_ai_generation_reservations_workspace_id_month_key_status_expires_at_idx"
ON "organization_ai_generation_reservations"("workspace_id", "month_key", "status", "expires_at");

ALTER TABLE "organization_ai_generation_reservations"
ADD CONSTRAINT "organization_ai_generation_reservations_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
