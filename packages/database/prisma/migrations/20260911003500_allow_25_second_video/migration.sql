ALTER TABLE "video_projects"
  DROP CONSTRAINT IF EXISTS "video_projects_duration_check";

ALTER TABLE "video_projects"
  ADD CONSTRAINT "video_projects_duration_check"
  CHECK ("duration_seconds" IN (25, 30, 60));
