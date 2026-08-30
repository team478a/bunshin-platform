import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260831120000_add_service_onboarding_responses/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('service onboarding response persistence', () => {
  it('keeps one current response for each service membership', () => {
    expect(migration).toContain('service_onboarding_responses_group_membership_id_key');
  });

  it('binds answers to the same workspace, service, membership and user', () => {
    expect(migration).toContain(
      'REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id")',
    );
    expect(migration).toContain('"workspace_id", "group_id", "group_membership_id", "user_id"');
  });

  it('stores the questions seen at completion time', () => {
    expect(migration).toContain('"questions_snapshot" JSONB NOT NULL');
  });
});
