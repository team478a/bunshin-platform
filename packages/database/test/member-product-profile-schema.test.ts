import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260906093000_add_member_product_profiles/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const repository = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('member product profile persistence boundary', () => {
  it('binds profiles to workspace, service, membership, user and a tracking link', () => {
    expect(schema).toContain('model MemberProductProfile');
    expect(schema).toContain('groupMembershipId      String');
    expect(schema).toContain('externalTrackingLinkId String');
    expect(schema).toContain('member_product_profiles_membership_fkey');
  });

  it('creates scoped indexes and cascading ownership constraints', () => {
    expect(migration).toContain('CREATE TABLE "member_product_profiles"');
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")',
    );
    expect(migration).toContain('REFERENCES "external_tracking_links"("id")');
    expect(migration).toContain('ON DELETE CASCADE');
  });

  it('rechecks the current user and active member link on reads and writes', () => {
    expect(repository).toContain('class PrismaMemberProductProfileRepository');
    expect(repository).toContain('userId: input.actorUserId');
    expect(repository).toContain("status: 'ACTIVE'");
    expect(repository).toContain("scopeType: 'MEMBER'");
    expect(repository).toContain('groupMembershipId: membership.id');
  });
});
