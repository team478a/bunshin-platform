CREATE TYPE "VideoDeliveryStatus" AS ENUM ('ASSIGNED', 'VIEWED', 'ACCEPTED', 'DECLINED', 'POSTED', 'EXPIRED');

CREATE TYPE "VideoDeliveryEventType" AS ENUM ('ASSIGNED', 'VIEWED', 'ACCEPTED', 'DECLINED', 'DOWNLOADED', 'POSTED');

CREATE TABLE "video_deliveries" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "program_enrollment_id" UUID,
  "video_project_id" UUID NOT NULL,
  "video_render_id" UUID NOT NULL,
  "status" "VideoDeliveryStatus" NOT NULL DEFAULT 'ASSIGNED',
  "rights_snapshot" JSONB NOT NULL,
  "expires_at" TIMESTAMPTZ(6),
  "viewed_at" TIMESTAMPTZ(6),
  "accepted_at" TIMESTAMPTZ(6),
  "declined_at" TIMESTAMPTZ(6),
  "posted_at" TIMESTAMPTZ(6),
  "assigned_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "video_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_deliveries_video_render_id_key" ON "video_deliveries"("video_render_id");
CREATE INDEX "video_deliveries_workspace_id_group_id_group_membership_id_status_created_at_idx" ON "video_deliveries"("workspace_id", "group_id", "group_membership_id", "status", "created_at");
CREATE INDEX "video_deliveries_workspace_id_owner_user_id_status_created_at_idx" ON "video_deliveries"("workspace_id", "owner_user_id", "status", "created_at");
CREATE INDEX "video_deliveries_workspace_id_group_id_program_enrollment_id_idx" ON "video_deliveries"("workspace_id", "group_id", "program_enrollment_id");
CREATE INDEX "video_deliveries_status_expires_at_idx" ON "video_deliveries"("status", "expires_at");

CREATE TABLE "video_delivery_events" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "video_delivery_id" UUID NOT NULL,
  "event_type" "VideoDeliveryEventType" NOT NULL,
  "event_data" JSONB NOT NULL DEFAULT '{}',
  "performed_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "video_delivery_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "video_delivery_events_workspace_id_group_id_video_delivery_id_created_at_idx" ON "video_delivery_events"("workspace_id", "group_id", "video_delivery_id", "created_at");
