ALTER TABLE "campaign_posting_approval_requests"
  ADD COLUMN "content_snapshot" JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE "campaign_posting_approval_requests" AS request
SET "content_snapshot" = content."content_json"
FROM "mission_contents" AS content
WHERE content."daily_mission_id" = request."daily_mission_id";
