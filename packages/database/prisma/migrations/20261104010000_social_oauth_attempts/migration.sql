CREATE TABLE social_oauth_attempts (
  state_hash CHAR(64) PRIMARY KEY,
  workspace_id UUID NOT NULL,
  group_id UUID NOT NULL,
  group_membership_id UUID NOT NULL,
  user_id UUID NOT NULL,
  bunshin_id UUID NOT NULL,
  platform VARCHAR(40) NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  consumed_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT social_oauth_attempts_membership_fkey FOREIGN KEY
    (workspace_id, group_id, group_membership_id, user_id)
    REFERENCES group_memberships (workspace_id, group_id, id, user_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT social_oauth_attempts_bunshin_fkey FOREIGN KEY
    (workspace_id, group_id, user_id, bunshin_id)
    REFERENCES bunshins (workspace_id, group_id, owner_user_id, id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT social_oauth_attempts_platform_check CHECK (platform = 'INSTAGRAM')
);
CREATE INDEX social_oauth_attempts_expiry_idx ON social_oauth_attempts (expires_at);
CREATE INDEX social_oauth_attempts_owner_idx
  ON social_oauth_attempts (workspace_id, group_id, group_membership_id, user_id, bunshin_id, created_at);
ALTER TABLE social_oauth_attempts ENABLE ROW LEVEL SECURITY;
