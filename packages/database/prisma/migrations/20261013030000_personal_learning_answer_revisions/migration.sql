BEGIN;
SET LOCAL lock_timeout = '5000ms';
SET LOCAL statement_timeout = '60000ms';
SET LOCAL idle_in_transaction_session_timeout = '60000ms';

-- Dynamic personal-learning assignments may need more than one evidence submission.
-- Legacy assignments remain single-answer through the repository's transactional guard.
DROP INDEX IF EXISTS "training_mission_answers_mission_assignment_id_key";

CREATE INDEX "training_mission_answers_workspace_id_group_id_mission_assignment_id_created_at_idx"
ON "training_mission_answers"("workspace_id", "group_id", "mission_assignment_id", "created_at");
COMMIT;
