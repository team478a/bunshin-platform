CREATE TABLE social_account_connections (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  group_id UUID NOT NULL,
  group_membership_id UUID NOT NULL,
  user_id UUID NOT NULL,
  platform VARCHAR(40) NOT NULL,
  external_account_id VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  status VARCHAR(24) NOT NULL,
  scopes VARCHAR(100)[] NOT NULL,
  encrypted_token TEXT,
  token_expires_at TIMESTAMPTZ(6),
  last_verified_at TIMESTAMPTZ(6),
  disconnected_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT social_connections_membership_fkey FOREIGN KEY
    (workspace_id, group_id, group_membership_id, user_id)
    REFERENCES group_memberships (workspace_id, group_id, id, user_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT social_connections_status_check CHECK (
    (status = 'CONNECTED' AND disconnected_at IS NULL AND encrypted_token IS NOT NULL AND token_expires_at IS NOT NULL)
    OR (status = 'RECONNECT_REQUIRED' AND disconnected_at IS NULL AND encrypted_token IS NULL AND token_expires_at IS NULL)
    OR (status = 'DISCONNECTED' AND disconnected_at IS NOT NULL AND encrypted_token IS NULL)
  )
);
CREATE UNIQUE INDEX social_connections_owner_account_key
  ON social_account_connections (workspace_id, group_id, user_id, platform, external_account_id);
CREATE UNIQUE INDEX social_connections_grant_scope_key
  ON social_account_connections (workspace_id, group_id, group_membership_id, user_id, id);
CREATE INDEX social_connections_owner_idx
  ON social_account_connections (workspace_id, group_id, group_membership_id, user_id);
ALTER TABLE social_account_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE social_account_connection_grants (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  group_id UUID NOT NULL,
  group_membership_id UUID NOT NULL,
  user_id UUID NOT NULL,
  connection_id UUID NOT NULL,
  bunshin_id UUID NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT social_connection_grants_connection_fkey FOREIGN KEY
    (workspace_id, group_id, group_membership_id, user_id, connection_id)
    REFERENCES social_account_connections (workspace_id, group_id, group_membership_id, user_id, id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT social_connection_grants_bunshin_fkey FOREIGN KEY
    (workspace_id, group_id, user_id, bunshin_id)
    REFERENCES bunshins (workspace_id, group_id, owner_user_id, id) ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX social_connection_grants_connection_bunshin_key
  ON social_account_connection_grants (connection_id, bunshin_id);
CREATE INDEX social_connection_grants_owner_idx
  ON social_account_connection_grants (workspace_id, group_id, group_membership_id, user_id, bunshin_id);
ALTER TABLE social_account_connection_grants ENABLE ROW LEVEL SECURITY;
