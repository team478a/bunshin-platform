CREATE TYPE "ServiceMediaGenerationKind" AS ENUM ('IMAGE', 'VIDEO');

CREATE TABLE "service_media_generation_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "kind" "ServiceMediaGenerationKind" NOT NULL,
  "month_key" CHAR(7) NOT NULL,
  "operation_key" VARCHAR(200) NOT NULL,
  "status" "OrganizationAiReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "released_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_media_generation_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_media_reservation_operation_key"
ON "service_media_generation_reservations"("workspace_id", "group_id", "kind", "operation_key");

CREATE INDEX "service_media_reservation_month_status_idx"
ON "service_media_generation_reservations"("workspace_id", "group_id", "kind", "month_key", "status", "expires_at");

ALTER TABLE "service_media_generation_reservations"
ADD CONSTRAINT "service_media_generation_reservations_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_media_generation_reservations"
ADD CONSTRAINT "service_media_generation_reservations_workspace_id_group_id_fkey"
FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
