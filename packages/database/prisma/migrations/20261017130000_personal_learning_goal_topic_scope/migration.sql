-- D-2: a learner may have a distinct active goal for each personal-learning topic.
-- Keep the legacy one-active-goal-per-enrollment behavior for rows without a topic.
ALTER TABLE program_member_goals
  ADD COLUMN topic_id UUID;

UPDATE program_member_goals g
SET topic_id = c.topic_id
FROM personal_learning_goal_confirmations c
WHERE c.program_member_goal_id = g.id
  AND c.topic_id IS NOT NULL;

ALTER TABLE program_member_goals
  ADD CONSTRAINT program_member_goals_topic_fkey
    FOREIGN KEY (workspace_id, group_id, program_enrollment_id, topic_id)
    REFERENCES personal_learning_topics (workspace_id, group_id, program_enrollment_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX program_member_goals_active_key;
CREATE UNIQUE INDEX program_member_goals_legacy_active_key
  ON program_member_goals (workspace_id, group_id, program_enrollment_id)
  WHERE status = 'ACTIVE' AND topic_id IS NULL;
CREATE UNIQUE INDEX program_member_goals_topic_active_key
  ON program_member_goals (workspace_id, group_id, program_enrollment_id, topic_id)
  WHERE status = 'ACTIVE' AND topic_id IS NOT NULL;
CREATE INDEX program_member_goals_topic_idx
  ON program_member_goals (workspace_id, group_id, program_enrollment_id, topic_id, status);
