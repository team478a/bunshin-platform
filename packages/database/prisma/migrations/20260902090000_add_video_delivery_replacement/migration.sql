ALTER TABLE "video_deliveries"
ADD COLUMN "replaces_video_delivery_id" UUID;

CREATE UNIQUE INDEX "video_deliveries_replaces_video_delivery_id_key"
ON "video_deliveries"("replaces_video_delivery_id");

CREATE INDEX "video_deliveries_workspace_id_group_id_replaces_video_delivery_id_idx"
ON "video_deliveries"("workspace_id", "group_id", "replaces_video_delivery_id");
