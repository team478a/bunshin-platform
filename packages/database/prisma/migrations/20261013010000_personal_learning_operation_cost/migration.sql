ALTER TABLE personal_learning_call_admissions ADD COLUMN operation_context JSONB;
ALTER TABLE personal_learning_call_admissions ADD CONSTRAINT personal_learning_operation_context_object
 CHECK (operation_context IS NULL OR jsonb_typeof(operation_context) = 'object');
-- Existing evaluation/Pilot admissions remain NULL. No learner text, images or credentials.
