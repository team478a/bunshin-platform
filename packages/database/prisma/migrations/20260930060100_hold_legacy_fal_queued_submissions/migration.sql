-- Existing QUEUED fal rows cannot be distinguished from a POST whose response was lost.
-- Hold both for reconciliation instead of risking a new paid request after rollout.
-- A row with an already persisted request ID can use the existing status lookup path.
UPDATE "video_scene_generations"
SET "status" = 'SUBMITTED',
    "error_code" = NULL
WHERE "provider" = 'FAL'
  AND "status" = 'QUEUED'
  AND "external_job_id" IS NOT NULL;

UPDATE "video_scene_generations"
SET "status" = 'SUBMISSION_UNKNOWN',
    "error_code" = 'FAL_SUBMISSION_UNCONFIRMED',
    "started_at" = COALESCE("started_at", CURRENT_TIMESTAMP)
WHERE "provider" = 'FAL'
  AND "status" = 'QUEUED'
  AND "external_job_id" IS NULL;
