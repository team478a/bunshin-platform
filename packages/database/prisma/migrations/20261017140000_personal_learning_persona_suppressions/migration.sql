-- Keep only the learner's opt-out marker after deleting a persona value.
-- Attribute keys are not joined back to values or evidence in this table.
CREATE TABLE personal_learning_persona_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  group_id UUID NOT NULL,
  group_membership_id UUID NOT NULL,
  user_id UUID NOT NULL,
  attribute_key VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT personal_learning_persona_suppressions_member_attribute_key
    UNIQUE (workspace_id, group_id, group_membership_id, attribute_key),
  CONSTRAINT personal_learning_persona_suppressions_membership_fk
    FOREIGN KEY (workspace_id, group_id, group_membership_id, user_id)
    REFERENCES group_memberships (workspace_id, group_id, id, user_id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX personal_learning_persona_suppressions_member_created_idx
  ON personal_learning_persona_suppressions (workspace_id, group_id, group_membership_id, created_at);

ALTER TABLE personal_learning_persona_suppressions ENABLE ROW LEVEL SECURITY;
-- No direct client policies: access remains through scoped server-side repositories.
