-- Keep isolated staging OAuth grants distinct from development and production.
ALTER TABLE external_read_grants
  DROP CONSTRAINT external_read_grants_validity_check;

ALTER TABLE external_read_grants
  ADD CONSTRAINT external_read_grants_validity_check CHECK (
    environment IN ('test', 'development', 'staging', 'production')
    AND client_id ~ '^[a-zA-Z0-9_-]{1,128}$'
    AND revision > 0
    AND expires_at > granted_at
    AND expires_at <= granted_at + INTERVAL '24 hours'
    AND (revoked_at IS NULL OR revoked_at >= granted_at)
    AND cardinality(operations) = 1
    AND (
      (
        operations = ARRAY['member-usage:read']::VARCHAR(80)[]
        AND consent_version = 'external-read-consent-v1'
      )
      OR (
        operations <@ ARRAY[
          'member-usage:read',
          'daily-post-ideas:read',
          'campaign-brief:read'
        ]::VARCHAR(80)[]
        AND consent_version = 'external-read-consent-v2'
      )
    )
  );
