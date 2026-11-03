-- Nullable binding state only: existing grants remain unbound. No credentials are issued.
ALTER TYPE "GroupFeatureAuditAction" ADD VALUE 'EXTERNAL_READ_BOUND';
ALTER TABLE external_read_grants
  ADD COLUMN credential_binding_hash CHAR(64),
  ADD COLUMN credential_bound_at TIMESTAMPTZ(6),
  ADD CONSTRAINT external_read_grant_binding_check CHECK (
    (credential_binding_hash IS NULL AND credential_bound_at IS NULL)
    OR (credential_binding_hash IS NOT NULL AND credential_bound_at IS NOT NULL
      AND credential_binding_hash ~ '^[a-f0-9]{64}$'
      AND credential_bound_at >= granted_at AND credential_bound_at < expires_at)
  );

-- Match the platform's server-only table policy; no browser DB access policies.
ALTER TABLE external_read_grants ENABLE ROW LEVEL SECURITY;
