import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260830150000_add_service_participation_core/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const activityMigration = readFileSync(
  new URL(
    '../prisma/migrations/20260916140000_add_service_membership_activity/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const eventsMigration = readFileSync(
  new URL(
    '../prisma/migrations/20260916150000_add_service_membership_events/migration.sql',
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

  it('keeps product-wide activity metadata on the reusable service membership', () => {
    expect(activityMigration).toMatch(
      /ALTER TABLE\s+"group_memberships"[\s\S]*ADD COLUMN\s+"last_used_at"\s+TIMESTAMPTZ\(6\)/,
    );
  });

  it('scopes notification consent and lifecycle events to the same service membership', () => {
    expect(eventsMigration).toContain('CREATE TABLE "service_notification_preferences"');
    expect(eventsMigration).toContain('CREATE TABLE "service_membership_events"');
    expect(eventsMigration).toContain(
      'REFERENCES "group_memberships"("workspace_id", "group_id", "id", "user_id")',
    );
    expect(eventsMigration).not.toContain('metadata');
  });
});
