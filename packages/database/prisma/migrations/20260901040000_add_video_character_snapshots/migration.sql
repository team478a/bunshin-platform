ALTER TABLE "video_projects"
  ADD COLUMN "character_profile_version_id" UUID,
  ADD COLUMN "character_profile_snapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "character_reference_snapshot" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX "video_projects_workspace_id_group_id_character_profile_version_id_idx"
  ON "video_projects"("workspace_id", "group_id", "character_profile_version_id");
