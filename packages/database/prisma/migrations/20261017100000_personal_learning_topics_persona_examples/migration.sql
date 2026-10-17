-- Additive PR-D storage. Existing request/goal/plan rows remain intact.
CREATE TABLE personal_learning_topics (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  group_id UUID NOT NULL,
  program_enrollment_id UUID NOT NULL,
  group_membership_id UUID NOT NULL,
  user_id UUID NOT NULL,
  title VARCHAR(160) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED')),
  source_request_id UUID,
  goal_snapshot JSONB,
  plan_snapshot JSONB,
  last_learner_use_at TIMESTAMPTZ(3),
  ended_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT personal_learning_topics_scope_id_key UNIQUE (workspace_id, group_id, id),
  CONSTRAINT personal_learning_topics_enrollment_topic_key UNIQUE (workspace_id, group_id, program_enrollment_id, id),
  CONSTRAINT personal_learning_topics_enrollment_fk FOREIGN KEY (workspace_id, group_id, program_enrollment_id, group_membership_id)
    REFERENCES program_enrollments (workspace_id, group_id, id, group_membership_id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT personal_learning_topics_membership_fk FOREIGN KEY (workspace_id, group_id, group_membership_id, user_id)
    REFERENCES group_memberships (workspace_id, group_id, id, user_id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX personal_learning_topics_membership_status_idx
  ON personal_learning_topics (workspace_id, group_id, group_membership_id, status, updated_at);

-- Preserve each existing enrollment's first submitted wish as its initial topic without deleting or rewriting it.
INSERT INTO personal_learning_topics (
  id, workspace_id, group_id, program_enrollment_id, group_membership_id, user_id,
  title, status, source_request_id, last_learner_use_at, created_at, updated_at
)
SELECT DISTINCT ON (workspace_id, group_id, program_enrollment_id)
  gen_random_uuid(), workspace_id, group_id, program_enrollment_id, group_membership_id, user_id,
  COALESCE(NULLIF(left(btrim(original_text), 160), ''), '最初の学習テーマ'),
  'ACTIVE', id, NULL, CURRENT_TIMESTAMP
FROM personal_learning_requests
ORDER BY workspace_id, group_id, program_enrollment_id, revision ASC, id ASC;

CREATE TABLE personal_learning_persona_items (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  group_id UUID NOT NULL,
  group_membership_id UUID NOT NULL,
  user_id UUID NOT NULL,
  attribute_key VARCHAR(80) NOT NULL,
  value VARCHAR(1000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'UNCONFIRMED' CHECK (status IN ('UNCONFIRMED', 'CONFIRMED', 'REJECTED')),
  evidence_type VARCHAR(40) NOT NULL,
  evidence_id UUID NOT NULL,
  evidence_created_at TIMESTAMPTZ(3) NOT NULL,
  last_learner_use_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT personal_learning_persona_items_member_attribute_key UNIQUE (workspace_id, group_id, group_membership_id, attribute_key),
  CONSTRAINT personal_learning_persona_items_membership_fk FOREIGN KEY (workspace_id, group_id, group_membership_id, user_id)
    REFERENCES group_memberships (workspace_id, group_id, id, user_id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX personal_learning_persona_items_member_status_idx
  ON personal_learning_persona_items (workspace_id, group_id, group_membership_id, status, updated_at);

CREATE TABLE personal_learning_saved_examples (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  group_id UUID NOT NULL,
  group_membership_id UUID NOT NULL,
  user_id UUID NOT NULL,
  title VARCHAR(160) NOT NULL,
  content TEXT NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_id UUID NOT NULL,
  last_learner_use_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT personal_learning_saved_examples_member_id_key UNIQUE (workspace_id, group_id, group_membership_id, id),
  CONSTRAINT personal_learning_saved_examples_membership_fk FOREIGN KEY (workspace_id, group_id, group_membership_id, user_id)
    REFERENCES group_memberships (workspace_id, group_id, id, user_id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX personal_learning_saved_examples_member_created_idx
  ON personal_learning_saved_examples (workspace_id, group_id, group_membership_id, created_at);

ALTER TABLE personal_learning_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_learning_persona_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_learning_saved_examples ENABLE ROW LEVEL SECURITY;
-- No direct client policies: these rows are accessed through authenticated server-side repositories.
