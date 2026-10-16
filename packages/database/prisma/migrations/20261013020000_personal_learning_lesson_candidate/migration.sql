BEGIN;
SET LOCAL lock_timeout = '5000ms';
SET LOCAL statement_timeout = '60000ms';
SET LOCAL idle_in_transaction_session_timeout = '60000ms';

ALTER TABLE personal_learning_requests ADD COLUMN lesson_candidate JSONB;
ALTER TABLE personal_learning_requests ADD COLUMN candidate_confirmed_at TIMESTAMPTZ(3);
ALTER TABLE personal_learning_requests ADD CONSTRAINT learning_candidate_confirmation
 CHECK (candidate_confirmed_at IS NULL OR lesson_candidate IS NOT NULL);
ALTER TABLE personal_learning_requests ADD CONSTRAINT learning_candidate_object
 CHECK (lesson_candidate IS NULL OR jsonb_typeof(lesson_candidate) = 'object');
-- Existing learner ownership FKs, RLS, retention/deletion apply. No new progress table.
COMMIT;
