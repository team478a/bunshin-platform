BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE jobs ADD COLUMN maintenance_terminal_at timestamptz(6);
ALTER TABLE jobs ALTER COLUMN requested_by DROP NOT NULL;

-- Fail closed: never infer missing scope/version or migrate ordinary jobs.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM jobs j WHERE j.job_type = 'IMPROVEMENT_FEEDBACK_PURGE' AND (
      j.bunshin_id IS NOT NULL OR j.capability_type IS NOT NULL
      OR j.correlation_id <> 'feedback-retention-v1'
      OR NOT EXISTS (SELECT 1 FROM groups g WHERE g.workspace_id = j.workspace_id
        AND j.payload_reference = 'feedback-purge:feedback-retention-v1:' || g.id::text)
      OR j.idempotency_key <> j.payload_reference || ':' || to_char(j.scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      OR EXISTS (SELECT 1 FROM line_delivery_retry_requests r WHERE r.job_id = j.id)
      OR EXISTS (SELECT 1 FROM badge_line_delivery_retry_requests r WHERE r.job_id = j.id)
      OR EXISTS (SELECT 1 FROM video_render_retry_requests r WHERE r.job_id = j.id)
      OR EXISTS (SELECT 1 FROM video_scene_generation_retry_requests r WHERE r.job_id = j.id)
    )
  ) THEN RAISE EXCEPTION 'Feedback maintenance migration requires scope review'; END IF;
END $$;

UPDATE jobs SET requested_by = NULL,
  maintenance_terminal_at = CASE
    WHEN status = 'SUCCEEDED' THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
    WHEN status = 'CANCELLED' THEN COALESCE(cancelled_at, CURRENT_TIMESTAMP)
    -- Old DEAD has no reliable terminal time: do not use mutable updated_at.
    WHEN status = 'DEAD' THEN CURRENT_TIMESTAMP
    ELSE NULL END
WHERE job_type = 'IMPROVEMENT_FEEDBACK_PURGE';

ALTER TABLE jobs ADD CONSTRAINT jobs_actor_contract CHECK (
  (job_type <> 'IMPROVEMENT_FEEDBACK_PURGE' AND requested_by IS NOT NULL
    AND maintenance_terminal_at IS NULL)
  OR (job_type = 'IMPROVEMENT_FEEDBACK_PURGE' AND requested_by IS NULL
    AND bunshin_id IS NULL AND capability_type IS NULL
    AND correlation_id = 'feedback-retention-v1'
    AND payload_reference ~ '^feedback-purge:feedback-retention-v1:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    AND idempotency_key = payload_reference || ':' || to_char(scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    AND ((status IN ('SUCCEEDED', 'CANCELLED', 'DEAD') AND maintenance_terminal_at IS NOT NULL)
      OR (status IN ('PENDING', 'LEASED', 'RETRY_SCHEDULED') AND maintenance_terminal_at IS NULL)))
);

CREATE FUNCTION enforce_feedback_maintenance_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.job_type <> 'IMPROVEMENT_FEEDBACK_PURGE'
     AND NEW.job_type = 'IMPROVEMENT_FEEDBACK_PURGE'
  THEN RAISE EXCEPTION 'User job cannot become maintenance'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.job_type = 'IMPROVEMENT_FEEDBACK_PURGE' THEN
    IF (NEW.job_type, NEW.workspace_id, NEW.environment, NEW.payload_reference,
        NEW.idempotency_key, NEW.scheduled_at, NEW.requested_by)
      IS DISTINCT FROM
       (OLD.job_type, OLD.workspace_id, OLD.environment, OLD.payload_reference,
        OLD.idempotency_key, OLD.scheduled_at, OLD.requested_by)
    THEN RAISE EXCEPTION 'Maintenance job identity is immutable'; END IF;
    IF OLD.status IN ('SUCCEEDED', 'CANCELLED', 'DEAD') AND
       (NEW.status, NEW.maintenance_terminal_at, NEW.completed_at, NEW.cancelled_at)
       IS DISTINCT FROM (OLD.status, OLD.maintenance_terminal_at, OLD.completed_at, OLD.cancelled_at)
    THEN RAISE EXCEPTION 'Maintenance terminal state is immutable'; END IF;
  END IF;
  IF NEW.job_type = 'IMPROVEMENT_FEEDBACK_PURGE' THEN
    IF TG_OP = 'INSERT' AND NOT EXISTS (
      SELECT 1 FROM groups g WHERE g.workspace_id = NEW.workspace_id
        AND NEW.payload_reference = 'feedback-purge:feedback-retention-v1:' || g.id::text
    ) THEN RAISE EXCEPTION 'Maintenance scope is unavailable'; END IF;
    IF NEW.status = 'SUCCEEDED' THEN
      NEW.maintenance_terminal_at := COALESCE(NEW.maintenance_terminal_at, NEW.completed_at, CURRENT_TIMESTAMP);
    ELSIF NEW.status = 'CANCELLED' THEN
      NEW.maintenance_terminal_at := COALESCE(NEW.maintenance_terminal_at, NEW.cancelled_at, CURRENT_TIMESTAMP);
    ELSIF NEW.status = 'DEAD' THEN
      NEW.maintenance_terminal_at := COALESCE(NEW.maintenance_terminal_at, CURRENT_TIMESTAMP);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER jobs_feedback_maintenance_contract BEFORE INSERT OR UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION enforce_feedback_maintenance_job();
CREATE INDEX jobs_feedback_maintenance_expiry ON jobs(environment, maintenance_terminal_at, id)
  WHERE job_type = 'IMPROVEMENT_FEEDBACK_PURGE' AND status IN ('SUCCEEDED', 'CANCELLED', 'DEAD');
COMMIT;
