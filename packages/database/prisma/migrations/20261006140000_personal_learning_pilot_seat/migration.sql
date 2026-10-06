-- Additive cumulative participant ledger. No backfill/approval/enable.
CREATE TABLE personal_learning_pilot_seats (
 id UUID PRIMARY KEY,
 workspace_id UUID NOT NULL,
 group_id UUID NOT NULL,
 service_program_id UUID NOT NULL,
 participant_hash CHAR(64) NOT NULL CHECK (participant_hash ~ '^[a-f0-9]{64}$'),
 program_enrollment_id UUID REFERENCES program_enrollments(id) ON DELETE SET NULL ON UPDATE CASCADE,
 kind VARCHAR(16) NOT NULL CHECK (kind IN ('INTERNAL','EXTERNAL')),
 cohort VARCHAR(16) NOT NULL,
 seat_number INTEGER NOT NULL CHECK (seat_number BETWEEN 1 AND 100),
 admitted_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 revoked_at TIMESTAMPTZ(3),
 CHECK ((kind='INTERNAL' AND cohort='INTERNAL') OR (kind='EXTERNAL' AND cohort IN ('WAVE_1','WAVE_2','WAVE_3','WAVE_4'))),
 CHECK (revoked_at IS NULL OR revoked_at >= admitted_at),
 FOREIGN KEY (workspace_id,group_id,service_program_id) REFERENCES service_programs(workspace_id,group_id,id) ON DELETE CASCADE ON UPDATE CASCADE,
 UNIQUE (service_program_id,participant_hash),
 UNIQUE (service_program_id,kind,seat_number),
 UNIQUE (service_program_id,program_enrollment_id)
);
ALTER TABLE personal_learning_pilot_seats ENABLE ROW LEVEL SECURITY;
-- No public policy; trusted server only. The slot is never recycled by the application.

-- Physical Enrollment deletion (including account cleanup) redacts the link but never frees a slot.
CREATE FUNCTION redact_personal_learning_pilot_seat() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM personal_learning_pilot_seats WHERE program_enrollment_id=OLD.id) THEN
    UPDATE personal_learning_pilot_seats SET program_enrollment_id=NULL, revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE program_enrollment_id=OLD.id;
    UPDATE service_programs p SET settings=jsonb_set(p.settings,'{personalLearningPilot,enrollmentIds}',
      COALESCE((SELECT jsonb_agg(v) FROM jsonb_array_elements(p.settings->'personalLearningPilot'->'enrollmentIds') v WHERE v <> to_jsonb(OLD.id::text)), '[]'::jsonb))
      WHERE p.id=OLD.service_program_id AND p.workspace_id=OLD.workspace_id AND p.group_id=OLD.group_id
        AND p.settings->'personalLearningPilot'->'participantControl'->>'version'='PILOT_PARTICIPANT_CAP_V1';
    UPDATE service_programs p SET settings=jsonb_set(p.settings,'{personalLearningPilot,participantControl,revision}',to_jsonb((p.settings->'personalLearningPilot'->'participantControl'->>'revision')::bigint+1))
      WHERE p.id=OLD.service_program_id AND p.workspace_id=OLD.workspace_id AND p.group_id=OLD.group_id
        AND p.settings->'personalLearningPilot'->'participantControl'->>'version'='PILOT_PARTICIPANT_CAP_V1'
        AND p.settings->'personalLearningPilot'->'participantControl'->>'revision' ~ '^[0-9]{1,15}$';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER redact_personal_learning_pilot_seat BEFORE DELETE ON program_enrollments FOR EACH ROW EXECUTE FUNCTION redact_personal_learning_pilot_seat();

-- A configured cap Program must never accidentally fall back to the legacy V1 scheduler.
CREATE FUNCTION preserve_personal_learning_pilot_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.settings->'personalLearningPilot'->'participantControl'->>'version'='PILOT_PARTICIPANT_CAP_V1'
    AND (NEW.settings->>'moduleKey' IS DISTINCT FROM 'AI_TRAINING_V1'
      OR NEW.settings->'personalLearningPilot'->'participantControl'->>'version' IS DISTINCT FROM 'PILOT_PARTICIPANT_CAP_V1') THEN
    RAISE EXCEPTION 'configured Personal Learning Pilot identity cannot be removed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_personal_learning_pilot_identity BEFORE UPDATE OF settings ON service_programs FOR EACH ROW EXECUTE FUNCTION preserve_personal_learning_pilot_identity();
