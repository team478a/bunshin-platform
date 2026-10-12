import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20261012090000_oem_billing_policy_revision/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

describe('OEM billing policy revision schema', () => {
  it('keeps cutover corrections append-only and one-to-one', () => {
    expect(schema).toContain('model OemBillingPolicyRevision');
    expect(schema).toContain('@relation("OemBillingPolicyRevisionSupersession"');
    expect(migration).toContain('oem_billing_policy_revision_one_root');
    expect(migration).toContain('oem_billing_policy_revisions_supersedes_id_key');
    expect(migration).toContain('OEM billing policy revisions are append-only');
    expect(migration).toContain('BEFORE UPDATE OR DELETE');
    expect(migration).toContain('enforce_oem_billing_policy_revision_workspace');
    expect(migration).toContain('supersession must stay within one workspace');
    expect(migration).not.toContain('UPDATE "oem_billing_policies"');
    expect(migration).not.toContain('DELETE FROM "oem_billing_policies"');
  });
});
