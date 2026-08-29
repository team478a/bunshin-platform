import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260829090000_add_badge_entitlement_usage/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const repository = readFileSync(new URL('../src/badge-reward.ts', import.meta.url), 'utf8');

describe('badge entitlement consumption persistence', () => {
  it('makes payment selection idempotent per owned resource', () => {
    expect(migration).toContain('"workspace_id", "user_id", "resource_type", "resource_id"');
    expect(repository).toContain('pg_advisory_xact_lock');
  });

  it('stores a refund separately from the original consumption', () => {
    expect(migration).toContain("('CONSUMED', 'REFUNDED')");
    expect(migration).toContain('"refund_reason" VARCHAR(500)');
    expect(repository).toContain('quantityRemaining: { increment: 1 }');
  });
});
