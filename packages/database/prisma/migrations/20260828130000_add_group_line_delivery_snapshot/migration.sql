ALTER TABLE "line_message_deliveries" ADD COLUMN "group_id" UUID;

CREATE INDEX "line_message_deliveries_workspace_group_environment_status_idx"
  ON "line_message_deliveries"("workspace_id", "group_id", "environment", "status");

ALTER TABLE "line_message_deliveries"
  ADD CONSTRAINT "line_message_deliveries_workspace_group_fkey"
  FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups"("workspace_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing deliveries remain platform/shared deliveries. New Group snapshots are
-- derived by the server from the Mission's Campaign or immutable link usage.
