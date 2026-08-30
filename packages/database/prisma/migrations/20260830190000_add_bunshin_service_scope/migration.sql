ALTER TABLE "bunshins"
ADD COLUMN "group_id" UUID;

CREATE INDEX "bunshins_workspace_id_group_id_owner_user_id_status_updated_at_idx"
ON "bunshins"("workspace_id", "group_id", "owner_user_id", "status", "updated_at");

ALTER TABLE "bunshins"
ADD CONSTRAINT "bunshins_workspace_id_group_id_fkey"
FOREIGN KEY ("workspace_id", "group_id")
REFERENCES "groups"("workspace_id", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
