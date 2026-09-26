import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260926220000_add_social_activity_barriers',
    'migration.sql',
  ),
  'utf8',
);

describe('social activity barrier persistence', () => {
  it('binds every case to service membership, user, workspace, and bunshin scope', () => {
    expect(schema).toContain('model SocialActivityBarrierCase');
    expect(schema).toContain(
      '@@unique([workspaceId, groupId, groupMembershipId, userId, bunshinId, category]',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")',
    );
    expect(migration).toContain('FOREIGN KEY ("workspace_id", "bunshin_id")');
  });

  it('makes evidence idempotent without storing content fields', () => {
    expect(schema).toContain('@@unique([caseId, evidenceKey]');
    expect(schema).not.toMatch(
      /model SocialActivityBarrierEvidence[\s\S]*?\b(content|prompt|memory)\s+String/,
    );
    expect(migration).toContain('social_activity_barrier_evidence_idempotency_key');
  });

  it('stores only suspected as the default inferred status', () => {
    expect(schema).toContain('@default(SUSPECTED)');
    expect(migration).toContain(
      '"status" "SocialActivityBarrierStatus" NOT NULL DEFAULT \'SUSPECTED\'',
    );
  });
});
