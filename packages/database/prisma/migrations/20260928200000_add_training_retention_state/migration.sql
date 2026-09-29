CREATE TABLE "training_data_retention_states" (
  "program_enrollment_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "ended_at" TIMESTAMPTZ(3),
  "work_redacted_at" TIMESTAMPTZ(3),
  "progress_purged_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_data_retention_states_pkey" PRIMARY KEY ("program_enrollment_id"),
  CONSTRAINT "training_retention_enrollment_scope_fk" FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id")
    REFERENCES "program_enrollments" ("workspace_id", "group_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "training_retention_scope_idx" ON "training_data_retention_states" ("workspace_id", "group_id");
CREATE UNIQUE INDEX "training_retention_scope_enrollment_key" ON "training_data_retention_states" ("workspace_id", "group_id", "program_enrollment_id");
ALTER TABLE "training_data_retention_states" ENABLE ROW LEVEL SECURITY;

-- Only future transitions are recorded. Existing terminal rows are not backfilled.
CREATE FUNCTION record_training_enrollment_end() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM service_programs p WHERE p.id = NEW.service_program_id
      AND p.workspace_id = NEW.workspace_id AND p.group_id = NEW.group_id
      AND p.settings->>'moduleKey' = 'AI_TRAINING_V1') THEN
    IF NEW.status IN ('COMPLETED', 'CANCELLED', 'EXPIRED') AND OLD.status NOT IN ('COMPLETED', 'CANCELLED', 'EXPIRED') THEN
      INSERT INTO training_data_retention_states (program_enrollment_id, workspace_id, group_id, ended_at)
      VALUES (NEW.id, NEW.workspace_id, NEW.group_id,
        CASE WHEN NEW.status = 'EXPIRED' AND NEW.ends_at <= CURRENT_TIMESTAMP THEN NEW.ends_at ELSE CURRENT_TIMESTAMP END)
      ON CONFLICT (program_enrollment_id) DO UPDATE SET ended_at = EXCLUDED.ended_at, updated_at = CURRENT_TIMESTAMP;
    ELSIF NEW.status = 'ACTIVE' THEN
      UPDATE training_data_retention_states SET ended_at = NULL, work_redacted_at = NULL,
        progress_purged_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE program_enrollment_id = NEW.id AND workspace_id = NEW.workspace_id AND group_id = NEW.group_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER training_enrollment_end_transition AFTER UPDATE OF status ON program_enrollments
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION record_training_enrollment_end();
