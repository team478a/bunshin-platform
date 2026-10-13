CREATE TABLE personal_learning_practice_support_images (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  group_id UUID NOT NULL,
  program_enrollment_id UUID NOT NULL,
  group_membership_id UUID NOT NULL,
  mission_assignment_id UUID NOT NULL,
  request_event_id UUID NOT NULL,
  user_id UUID NOT NULL,
  mime_type VARCHAR(32) NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  size_bytes INTEGER NOT NULL,
  bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT personal_learning_support_image_event_fk
    FOREIGN KEY (workspace_id, group_id, request_event_id)
    REFERENCES program_action_events(workspace_id, group_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT personal_learning_support_image_enrollment_fk
    FOREIGN KEY (workspace_id, group_id, program_enrollment_id, group_membership_id)
    REFERENCES program_enrollments(workspace_id, group_id, id, group_membership_id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT personal_learning_support_image_membership_fk
    FOREIGN KEY (workspace_id, group_id, group_membership_id, user_id)
    REFERENCES group_memberships(workspace_id, group_id, id, user_id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT personal_learning_support_image_assignment_fk
    FOREIGN KEY (workspace_id, group_id, mission_assignment_id)
    REFERENCES program_mission_assignments(workspace_id, group_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT personal_learning_support_image_type_check CHECK (mime_type = 'image/jpeg'),
  CONSTRAINT personal_learning_support_image_size_check CHECK (size_bytes BETWEEN 1 AND 512000 AND octet_length(bytes) = size_bytes),
  CONSTRAINT personal_learning_support_image_digest_check CHECK (sha256 ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX personal_learning_support_image_event_key
  ON personal_learning_practice_support_images(workspace_id, group_id, request_event_id);
CREATE UNIQUE INDEX personal_learning_support_image_scope_id_key
  ON personal_learning_practice_support_images(workspace_id, group_id, id);
CREATE INDEX personal_learning_support_image_owner_created_idx
  ON personal_learning_practice_support_images(workspace_id, group_id, program_enrollment_id, user_id, created_at);

ALTER TABLE personal_learning_practice_support_images ENABLE ROW LEVEL SECURITY;
-- Server repository only; no anonymous/authenticated direct read or write policies.
