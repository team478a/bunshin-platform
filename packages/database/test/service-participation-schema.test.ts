import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260830150000_add_service_participation_core/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('service participation persistence', () => {
  it('adds a distinct approval waiting status and auditable transitions', () => {
    expect(migration).toContain("ADD VALUE 'PENDING_APPROVAL'");
    expect(migration).toContain("ADD VALUE 'REQUESTED'");
    expect(migration).toContain("ADD VALUE 'APPROVED'");
  });

  it('versions legal documents inside a service boundary', () => {
    expect(migration).toContain('service_legal_documents_group_id_type_version_key');
    expect(migration).toContain(
      'REFERENCES "service_configurations"("workspace_id", "group_id", "id")',
    );
  });

  it('binds every consent to the same workspace, service, membership and user', () => {
    expect(migration).toContain(
      'REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id")',
    );
    expect(migration).toContain(
      'REFERENCES "service_legal_documents"("workspace_id", "group_id", "id")',
    );
  });
});
