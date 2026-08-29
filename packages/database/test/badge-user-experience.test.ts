import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20260829060000_add_badge_user_visibility/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);
const repository = readFileSync(
  fileURLToPath(new URL('../src/badge-user-experience.ts', import.meta.url)),
  'utf8',
);

describe('badge user visibility boundaries', () => {
  it('starts private and requires an exact group scope when shared', () => {
    expect(migration).toContain("DEFAULT 'PRIVATE'");
    expect(migration).toContain('badge_award_visibility_scope_check');
    expect(migration).toContain('badge_award_visibilities_shared_group_scope_fkey');
  });

  it('keeps one user-controlled visibility setting per award', () => {
    expect(migration).toContain('badge_award_visibilities_badge_award_id_key');
    expect(migration).toContain('badge_award_visibilities_badge_award_scope_fkey');
    expect(repository).toContain('userId: input.actorUserId');
    expect(repository).toContain("status: 'ACTIVE'");
  });

  it('requires an active membership before group sharing', () => {
    expect(repository).toContain('groupMembership.findFirst');
    expect(repository).toContain("group: { status: 'ACTIVE' }");
    expect(repository).not.toContain('PUBLIC');
  });
});
