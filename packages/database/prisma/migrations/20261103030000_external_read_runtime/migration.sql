-- Internal read admission/audit only; grants, clients and service features stay unchanged.
CREATE UNIQUE INDEX external_read_grants_admission_scope_key
  ON external_read_grants (id, environment, client_id, user_id);

CREATE TABLE external_read_admissions (
  id UUID PRIMARY KEY,
  connection_id UUID NOT NULL,
  client_id VARCHAR(128) NOT NULL,
  environment VARCHAR(16) NOT NULL,
  user_id UUID NOT NULL,
  admitted_at TIMESTAMPTZ(6) NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  released_at TIMESTAMPTZ(6),
  CONSTRAINT external_read_admissions_grant_fkey FOREIGN KEY
    (connection_id, environment, client_id, user_id)
    REFERENCES external_read_grants (id, environment, client_id, user_id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT external_read_admissions_validity_check CHECK (
    environment IN ('test', 'development', 'production')
    AND client_id ~ '^[a-zA-Z0-9_-]{1,128}$'
    AND expires_at >= admitted_at + INTERVAL '10 seconds'
    AND expires_at <= admitted_at + INTERVAL '30 seconds'
    AND (released_at IS NULL OR released_at >= admitted_at)
  )
);
CREATE INDEX external_read_admissions_client_idx ON external_read_admissions (environment, client_id, admitted_at);
CREATE INDEX external_read_admissions_connection_idx ON external_read_admissions (environment, connection_id, admitted_at);
CREATE INDEX external_read_admissions_user_idx ON external_read_admissions (environment, user_id, admitted_at);
CREATE INDEX external_read_admissions_retention_idx ON external_read_admissions (environment, admitted_at, id);

CREATE TABLE external_read_audits (
  id UUID PRIMARY KEY,
  attempt_id UUID NOT NULL,
  version VARCHAR(40) NOT NULL,
  request_id VARCHAR(128) NOT NULL,
  connection_id VARCHAR(128) NOT NULL,
  client_id VARCHAR(128) NOT NULL,
  environment VARCHAR(16) NOT NULL,
  operation VARCHAR(80) NOT NULL,
  outcome VARCHAR(20) NOT NULL,
  count INTEGER NOT NULL,
  occurred_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT external_read_audits_validity_check CHECK (
    environment IN ('test', 'development', 'production')
    AND version = 'external-read-v1' AND operation = 'member-usage:read'
    AND request_id ~ '^[a-zA-Z0-9_-]{1,128}$'
    AND connection_id ~ '^[a-zA-Z0-9_-]{1,128}$'
    AND client_id ~ '^[a-zA-Z0-9_-]{1,128}$'
    AND outcome IN ('READ_COMPLETED', 'DENIED', 'LIMITED', 'TIMEOUT', 'UNAVAILABLE', 'INVALID')
    AND count BETWEEN 0 AND 10 AND (outcome = 'READ_COMPLETED' OR count = 0)
  )
);
CREATE UNIQUE INDEX external_read_audits_attempt_outcome_key ON external_read_audits (attempt_id, outcome);
CREATE INDEX external_read_audits_retention_idx ON external_read_audits (environment, occurred_at, id);

-- Only privileged server DB access; never expose these records through browser DB roles.
ALTER TABLE external_read_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_read_audits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON external_read_admissions, external_read_audits FROM PUBLIC;
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON external_read_admissions, external_read_audits FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
