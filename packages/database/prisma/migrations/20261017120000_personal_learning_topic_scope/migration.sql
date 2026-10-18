-- D-2: bind wishes, confirmed goals/plans and conversation source records to one D-1 topic.
-- Existing single-theme history is moved to the initial migrated topic; values are not rewritten.
ALTER TABLE personal_learning_requests
  ADD COLUMN topic_id UUID;
ALTER TABLE personal_learning_goal_confirmations
  ADD COLUMN topic_id UUID;
ALTER TABLE personal_learning_plan_revisions
  ADD COLUMN topic_id UUID;

UPDATE personal_learning_requests r
SET topic_id = t.id
FROM personal_learning_topics t
WHERE t.workspace_id = r.workspace_id
  AND t.group_id = r.group_id
  AND t.program_enrollment_id = r.program_enrollment_id
  AND t.source_request_id = (
    SELECT first_request.id FROM personal_learning_requests first_request
    WHERE first_request.workspace_id = r.workspace_id
      AND first_request.group_id = r.group_id
      AND first_request.program_enrollment_id = r.program_enrollment_id
    ORDER BY first_request.revision ASC, first_request.id ASC
    LIMIT 1
  );

UPDATE personal_learning_goal_confirmations g
SET topic_id = t.id
FROM personal_learning_topics t
WHERE t.workspace_id = g.workspace_id
  AND t.group_id = g.group_id
  AND t.program_enrollment_id = g.program_enrollment_id
  AND t.source_request_id = (
    SELECT first_request.id FROM personal_learning_requests first_request
    WHERE first_request.workspace_id = g.workspace_id
      AND first_request.group_id = g.group_id
      AND first_request.program_enrollment_id = g.program_enrollment_id
    ORDER BY first_request.revision ASC, first_request.id ASC
    LIMIT 1
  );

UPDATE personal_learning_plan_revisions p
SET topic_id = g.topic_id
FROM personal_learning_goal_confirmations g
WHERE g.workspace_id = p.workspace_id
  AND g.group_id = p.group_id
  AND g.program_enrollment_id = p.program_enrollment_id
  AND g.group_membership_id = p.group_membership_id
  AND g.user_id = p.user_id
  AND g.program_member_goal_id = p.program_member_goal_id;

-- Keep an in-progress legacy practice assignment attached to the migrated initial theme.
UPDATE program_mission_assignments a
SET display_snapshot = jsonb_set(
  COALESCE(a.display_snapshot, '{}'::jsonb),
  '{dynamicPractice,topicId}',
  to_jsonb(p.topic_id::text),
  true
)
FROM personal_learning_plan_revisions p
WHERE p.topic_id IS NOT NULL
  AND a.workspace_id = p.workspace_id
  AND a.group_id = p.group_id
  AND a.program_enrollment_id = p.program_enrollment_id
  AND a.target_resource_type = 'PERSONAL_LEARNING_PLAN'
  AND a.target_resource_id = p.plan_id
  AND a.display_snapshot ? 'dynamicPractice';

DROP INDEX personal_learning_request_revision_key;
DROP INDEX personal_learning_request_operation_key;
ALTER TABLE personal_learning_requests
  ADD CONSTRAINT personal_learning_requests_topic_fk
    FOREIGN KEY (workspace_id, group_id, program_enrollment_id, topic_id)
    REFERENCES personal_learning_topics (workspace_id, group_id, program_enrollment_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX personal_learning_request_legacy_revision_key
  ON personal_learning_requests (workspace_id, group_id, program_enrollment_id, revision)
  WHERE topic_id IS NULL;
CREATE UNIQUE INDEX personal_learning_request_topic_revision_key
  ON personal_learning_requests (workspace_id, group_id, program_enrollment_id, topic_id, revision)
  WHERE topic_id IS NOT NULL;
CREATE UNIQUE INDEX personal_learning_request_legacy_operation_key
  ON personal_learning_requests (workspace_id, group_id, program_enrollment_id, idempotency_key)
  WHERE topic_id IS NULL;
CREATE UNIQUE INDEX personal_learning_request_topic_operation_key
  ON personal_learning_requests (workspace_id, group_id, program_enrollment_id, topic_id, idempotency_key)
  WHERE topic_id IS NOT NULL;
CREATE INDEX personal_learning_request_operation_idx
  ON personal_learning_requests (workspace_id, group_id, program_enrollment_id, idempotency_key);
CREATE INDEX personal_learning_request_topic_revision_idx
  ON personal_learning_requests (workspace_id, group_id, program_enrollment_id, topic_id, revision);

ALTER TABLE personal_learning_goal_confirmations
  ADD CONSTRAINT learning_confirmation_topic_fk
    FOREIGN KEY (workspace_id, group_id, program_enrollment_id, topic_id)
    REFERENCES personal_learning_topics (workspace_id, group_id, program_enrollment_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX learning_confirmation_topic_idx
  ON personal_learning_goal_confirmations (workspace_id, group_id, program_enrollment_id, topic_id);

ALTER TABLE personal_learning_plan_revisions
  ADD CONSTRAINT learning_plan_topic_fk
    FOREIGN KEY (workspace_id, group_id, program_enrollment_id, topic_id)
    REFERENCES personal_learning_topics (workspace_id, group_id, program_enrollment_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX learning_plan_topic_idx
  ON personal_learning_plan_revisions (workspace_id, group_id, program_enrollment_id, topic_id);

-- Conversation is append-only program_action_events. It is isolated by the requestId whose row
-- carries topic_id; each new event also carries topicId in metadata for explicit revalidation.
UPDATE program_action_events e
SET metadata = jsonb_set(COALESCE(e.metadata, '{}'::jsonb), '{topicId}', to_jsonb(r.topic_id::text), true)
FROM personal_learning_requests r
WHERE r.topic_id IS NOT NULL
  AND e.workspace_id = r.workspace_id
  AND e.group_id = r.group_id
  AND e.program_enrollment_id = r.program_enrollment_id
  AND e.metadata->>'threadId' = r.id::text
  AND e.event_type IN (
    'PERSONAL_LEARNING_CONVERSATION_MESSAGE',
    'PERSONAL_LEARNING_CONVERSATION_RESPONSE',
    'PERSONAL_LEARNING_CONVERSATION_SHARE'
  );
