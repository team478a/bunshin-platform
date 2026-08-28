import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260828120000_add_group_line_dedicated_pilot/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('group dedicated LINE pilot persistence', () => {
  it('requires an explicit pilot flag for dedicated routing', () => {
    expect(migration).toContain('group_line_routing_policies_dedicated_pilot_check');
    expect(migration).toContain('"mode" = \'DEDICATED\' AND "pilot_enabled" = true');
  });

  it('isolates versions and active configuration by workspace, group and environment', () => {
    expect(migration).toContain('group_line_channel_configurations_scope_version_key');
    expect(migration).toContain('group_line_channel_configurations_one_active_per_scope_idx');
    expect(migration).toContain(
      'ON "group_line_channel_configurations"("workspace_id", "group_id", "environment")',
    );
    expect(migration).toContain('WHERE "status" = \'ACTIVE\'');
  });

  it('uses composite group ownership foreign keys for every group-scoped table', () => {
    expect(migration.match(/REFERENCES "groups"\("workspace_id", "id"\)/g)).toHaveLength(3);
  });

  it('stores encrypted secret columns and never stores callback or webhook URLs', () => {
    expect(migration).toContain('"encrypted_login_secret" TEXT NOT NULL');
    expect(migration).toContain('"encrypted_messaging_secret" TEXT NOT NULL');
    expect(migration).toContain('"encrypted_access_token" TEXT NOT NULL');
    expect(migration).toContain('"webhook_routing_key" UUID NOT NULL');
    expect(migration).not.toContain('callback_url');
    expect(migration).not.toContain('webhook_url');
  });

  it('starts every dedicated configuration globally paused', () => {
    expect(migration).toContain('"globally_paused" BOOLEAN NOT NULL DEFAULT true');
  });
});
