-- New owner-approved grants only. No existing service/member access is enabled.
ALTER TYPE "GroupFeatureAuditAction" ADD VALUE 'EXTERNAL_READ_GRANTED';
ALTER TYPE "GroupFeatureAuditAction" ADD VALUE 'EXTERNAL_READ_REVOKED';

INSERT INTO feature_definitions (key, name, description, status, updated_at)
VALUES ('EXTERNAL.READ', '外部接続の限定読取', '本人が許可したBunshinの情報だけを外部接続から読み取る権限', 'ACTIVE', CURRENT_TIMESTAMP);

CREATE UNIQUE INDEX bunshin_external_read_owner_scope_key
  ON bunshins (workspace_id, group_id, owner_user_id, id);

CREATE TABLE external_read_grants (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  group_id UUID NOT NULL,
  group_membership_id UUID NOT NULL,
  user_id UUID NOT NULL,
  bunshin_id UUID NOT NULL,
  client_id VARCHAR(128) NOT NULL,
  environment VARCHAR(16) NOT NULL,
  operations VARCHAR(80)[] NOT NULL,
  consent_version VARCHAR(80) NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  granted_at TIMESTAMPTZ(6) NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  revoked_at TIMESTAMPTZ(6),
  CONSTRAINT external_read_grants_membership_fkey FOREIGN KEY
    (workspace_id, group_id, group_membership_id, user_id)
    REFERENCES group_memberships (workspace_id, group_id, id, user_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT external_read_grants_bunshin_fkey FOREIGN KEY
    (workspace_id, group_id, user_id, bunshin_id)
    REFERENCES bunshins (workspace_id, group_id, owner_user_id, id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT external_read_grants_validity_check CHECK (
    environment IN ('test', 'development', 'production')
    AND client_id ~ '^[a-zA-Z0-9_-]{1,128}$'
    AND revision > 0
    AND expires_at > granted_at
    AND expires_at <= granted_at + INTERVAL '24 hours'
    AND (revoked_at IS NULL OR revoked_at >= granted_at)
    AND cardinality(operations) = 1
    AND operations = ARRAY['member-usage:read']::VARCHAR(80)[]
    AND consent_version = 'external-read-consent-v1'
  )
);
CREATE INDEX external_read_grants_owner_idx
  ON external_read_grants (workspace_id, group_id, group_membership_id, user_id, granted_at);
