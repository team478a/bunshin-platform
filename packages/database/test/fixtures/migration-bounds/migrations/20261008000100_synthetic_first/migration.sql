BEGIN;
SET LOCAL lock_timeout = '100ms';
SET LOCAL statement_timeout = '1000ms';
SET LOCAL idle_in_transaction_session_timeout = '1000ms';
CREATE TABLE synthetic_first (id INTEGER PRIMARY KEY);
COMMIT;
