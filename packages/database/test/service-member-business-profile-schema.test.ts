import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260907143000_add_service_member_business_profiles/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('service member business profile schema', () => {
  it('binds a business profile to one service membership and user', () => {
    expect(migration).toContain('UNIQUE INDEX "service_member_business_profiles_scope_key"');
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")',
    );
    expect(migration).toContain(
      'REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id")',
    );
  });

  it('keeps service AI usage reservations inside the service scope', () => {
    expect(migration).toContain(
      'ON "service_ai_generation_reservations"("workspace_id", "group_id", "operation_key")',
    );
    expect(migration).toContain('FOREIGN KEY ("workspace_id", "group_id")');
    expect(migration).toContain('REFERENCES "groups"("workspace_id", "id")');
  });
});
