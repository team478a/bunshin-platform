import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20261119010000_external_read_staging_environment/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('external read staging environment migration', () => {
  it('adds staging without weakening the operation or consent checks', () => {
    expect(migration).toContain("environment IN ('test', 'development', 'staging', 'production')");
    expect(migration).toContain('cardinality(operations) = 1');
    expect(migration).toContain("consent_version = 'external-read-consent-v1'");
    expect(migration).toContain("consent_version = 'external-read-consent-v2'");
    expect(migration).toContain("'daily-post-ideas:read'");
    expect(migration).toContain("'campaign-brief:read'");
  });
});
