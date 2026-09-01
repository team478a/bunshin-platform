import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260901150000_add_service_line_broadcasts/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('service LINE broadcast persistence', () => {
  it('separates an operator broadcast from mission delivery', () => {
    expect(schema).toContain('model ServiceLineBroadcast');
    expect(schema).toContain('model ServiceLineBroadcastRecipient');
    expect(schema).toContain('model ServiceLineBroadcastAuditLog');
    expect(schema).toContain('enum ServiceLineBroadcastStatus');
  });

  it('keeps recipients inside the same service membership scope', () => {
    expect(migration).toContain('service_line_broadcast_recipients_broadcast_fkey');
    expect(migration).toContain('service_line_broadcast_recipients_membership_fkey');
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")',
    );
  });

  it('does not persist LINE credentials or recipient LINE identifiers', () => {
    expect(schema).not.toContain('serviceLineBroadcastAccessToken');
    expect(schema).not.toContain('serviceLineBroadcastRecipientLineUserId');
  });
});
