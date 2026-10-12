CREATE TABLE personal_learning_requests (
 id UUID PRIMARY KEY,
 workspace_id UUID NOT NULL,
 group_id UUID NOT NULL,
 program_enrollment_id UUID NOT NULL,
 group_membership_id UUID NOT NULL,
 user_id UUID NOT NULL,
 revision INTEGER NOT NULL CHECK (revision > 0),
 original_text VARCHAR(2000) NOT NULL CHECK (length(btrim(original_text)) > 0),
 device_type VARCHAR(16) CHECK (device_type IN ('SMARTPHONE', 'PC', 'BOTH')),
 tool_description VARCHAR(240),
 experience_description VARCHAR(300),
 current_position VARCHAR(500),
 idempotency_key VARCHAR(100) NOT NULL,
 digest VARCHAR(64) NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (workspace_id, group_id, program_enrollment_id, group_membership_id)
 REFERENCES program_enrollments(workspace_id, group_id, id, group_membership_id) ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY (workspace_id, group_id, group_membership_id, user_id)
 REFERENCES group_memberships(workspace_id, group_id, id, user_id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX personal_learning_request_revision_key
 ON personal_learning_requests(workspace_id, group_id, program_enrollment_id, revision);
CREATE UNIQUE INDEX personal_learning_request_operation_key
 ON personal_learning_requests(workspace_id, group_id, program_enrollment_id, idempotency_key);
ALTER TABLE personal_learning_requests ENABLE ROW LEVEL SECURITY;
-- Server repository only; no direct anon/authenticated read/write policies.
