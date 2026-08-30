import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260831010000_add_service_staff_roles/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const repository = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('service staff role persistence', () => {
  it('adds four service roles without replacing the legacy group role', () => {
    expect(schema).toContain('enum ServiceRole');
    for (const role of ['SERVICE_OWNER', 'SERVICE_ADMIN', 'CONTENT_EDITOR', 'PARTICIPANT'])
      expect(schema).toContain(role);
    expect(schema).toContain('role                       GroupRole');
    expect(schema).toContain('serviceRole                ServiceRole');
  });

  it('backfills the service creator as owner and other managers as administrators', () => {
    expect(migration).toContain('configuration."created_by_user_id" = membership."user_id"');
    expect(migration).toContain("THEN 'SERVICE_OWNER'");
    expect(migration).toContain("ELSE 'SERVICE_ADMIN'");
  });

  it('prevents removal of the final active owner and writes an audit record', () => {
    expect(repository).toContain("target.serviceRole === 'SERVICE_OWNER'");
    expect(repository).toContain('if (owners <= 1) return null');
    expect(repository).toContain('groupMembershipAuditLog.create');
  });
});
