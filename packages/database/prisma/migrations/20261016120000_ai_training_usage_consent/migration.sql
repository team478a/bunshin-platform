-- Versioned, append-only evidence of explicit external-AI consent per training Enrollment.
CREATE TABLE ai_training_usage_consents (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  group_id UUID NOT NULL,
  program_enrollment_id UUID NOT NULL,
  group_membership_id UUID NOT NULL,
  user_id UUID NOT NULL,
  consent_version VARCHAR(80) NOT NULL,
  text_digest CHAR(64) NOT NULL CHECK (text_digest ~ '^[a-f0-9]{64}$'),
  consented_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_training_usage_consent_enrollment_version_key
    UNIQUE (workspace_id, group_id, program_enrollment_id, consent_version),
  CONSTRAINT ai_training_usage_consent_enrollment_fk
    FOREIGN KEY (workspace_id, group_id, program_enrollment_id)
    REFERENCES program_enrollments(workspace_id, group_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ai_training_usage_consent_membership_user_fk
    FOREIGN KEY (workspace_id, group_id, group_membership_id, user_id)
    REFERENCES group_memberships(workspace_id, group_id, id, user_id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX ai_training_usage_consent_user_idx
  ON ai_training_usage_consents(workspace_id, group_id, user_id, consented_at);
ALTER TABLE ai_training_usage_consents ENABLE ROW LEVEL SECURITY;
-- No public policy; trusted server only.
