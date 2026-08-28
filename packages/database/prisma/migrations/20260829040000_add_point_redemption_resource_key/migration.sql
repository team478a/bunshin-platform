CREATE UNIQUE INDEX "point_redemptions_workspace_id_user_id_resource_type_resource_id_key"
ON "point_redemptions"("workspace_id", "user_id", "resource_type", "resource_id");
