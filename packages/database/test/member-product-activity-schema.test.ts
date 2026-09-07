import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260907190000_add_member_product_content_activity/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const repository = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('member product activity persistence boundary', () => {
  it('binds generated content to the original member-owned product profile', () => {
    expect(schema).toContain('model MemberProductContentRun');
    expect(migration).toContain('member_product_content_runs_profile_fkey');
    expect(migration).toContain(
      '"workspace_id", "group_id", "group_membership_id", "user_id", "profile_id"',
    );
  });

  it('keeps copy and posted activities append-only and idempotent per candidate', () => {
    expect(schema).toContain('model MemberProductContentEvent');
    expect(schema).toContain('@@unique([contentRunId, type, candidateIndex], map:');
    expect(schema).toContain('@@unique([contentRunId, operationKey], map:');
  });

  it('rechecks active membership, owner, service, profile, Bunshin and URL before writes', () => {
    expect(repository).toContain('class PrismaMemberProductActivityRepository');
    expect(repository).toContain('groupMembershipId: membership.id');
    expect(repository).toContain('ownerUserId: input.actorUserId');
    expect(repository).toContain('externalTrackingLinkId: input.externalTrackingLinkId');
    expect(repository).toContain("scopeType: 'MEMBER'");
  });

  it('limits service aggregates to content management roles in the same service', () => {
    expect(repository).toContain('async listServiceSummary');
    expect(repository).toContain("'SERVICE_OWNER', 'SERVICE_ADMIN', 'CONTENT_EDITOR'");
    expect(repository).toContain(
      'where: { workspaceId: input.workspaceId, groupId: input.groupId }',
    );
  });
});
