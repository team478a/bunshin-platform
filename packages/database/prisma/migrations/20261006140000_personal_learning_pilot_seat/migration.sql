-- Additive cumulative participant ledger. No backfill/approval/enable.
CREATE TABLE personal_learning_pilot_seats (
 id UUID PRIMARY KEY,
 workspace_id UUID NOT NULL,
 group_id UUID NOT NULL,
 service_program_id UUID NOT NULL,
 participant_hash CHAR(64) NOT NULL CHECK (participant_hash ~ '^[a-f0-9]{64}$'),
 program_enrollment_id UUID,
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
