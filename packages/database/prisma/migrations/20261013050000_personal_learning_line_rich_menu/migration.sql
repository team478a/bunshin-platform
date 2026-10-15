BEGIN;
SET LOCAL lock_timeout = '5000ms';
SET LOCAL statement_timeout = '60000ms';
SET LOCAL idle_in_transaction_session_timeout = '60000ms';

ALTER TABLE group_line_connections
  ADD COLUMN personal_learning_rich_menu_id VARCHAR(128),
  ADD COLUMN personal_learning_rich_menu_linked_at TIMESTAMPTZ(6),
  ADD COLUMN personal_learning_rich_menu_content_hash CHAR(64);

COMMIT;
