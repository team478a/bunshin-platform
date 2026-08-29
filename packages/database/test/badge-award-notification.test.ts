import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20260829100000_add_badge_award_notifications/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);
const repository = readFileSync(
  fileURLToPath(new URL('../src/badge-user-experience.ts', import.meta.url)),
  'utf8',
);

describe('badge award notification boundaries', () => {
  it('creates at most one notification for an award', () => {
    expect(migration).toContain('badge_award_notifications_badge_award_id_key');
    expect(repository).toContain('skipDuplicates: true');
  });

  it('keeps workspace and user isolation when reading', () => {
    expect(migration).toContain(
      'badge_award_notifications_workspace_id_user_id_badge_award_id_fkey',
    );
    expect(repository).toContain('workspaceId: input.workspaceId');
    expect(repository).toContain('userId: input.actorUserId');
    expect(repository).toContain('readAt: null');
  });
});
