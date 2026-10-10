BEGIN;
SET LOCAL lock_timeout = '100ms';
SET LOCAL statement_timeout = '1s';
SET LOCAL idle_in_transaction_session_timeout = '1s';

SELECT pg_sleep(2);
CREATE TABLE synthetic_after_timeout (id INTEGER PRIMARY KEY);

COMMIT;
