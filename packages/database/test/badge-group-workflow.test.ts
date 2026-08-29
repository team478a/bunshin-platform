import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20260829070000_add_group_badge_workflow/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);
const source = readFileSync(
  fileURLToPath(new URL('../src/badge-group-workflow.ts', import.meta.url)),
  'utf8',
);
const badgeCoreSource = readFileSync(
  fileURLToPath(new URL('../src/index.ts', import.meta.url)),
  'utf8',
);

describe('group badge workflow boundaries', () => {
  it('keeps approval and candidate state append-only and scoped', () => {
    expect(migration).toContain('badge_approval_requests_group_scope_fkey');
    expect(migration).toContain('badge_award_candidates_group_scope_fkey');
    expect(migration).toContain('badge_candidate_separate_reviewer_check');
    expect(migration).toContain('badge_approval_review_state_check');
    expect(migration).toContain('badge_candidate_review_state_check');
  });
  it('requires super admin approval and a separate candidate reviewer', () => {
    expect(source).toContain("role: 'SUPER_ADMIN'");
    expect(source).toContain('input.actorUserId === candidate.userId');
    expect(source).toContain('input.actorUserId === candidate.nominatedByUserId');
    expect(source).toContain('GROUP_BADGE_CANDIDATE_NOMINATED');
    expect(badgeCoreSource).toContain("definition?.ownerType === 'GROUP'");
  });
  it('creates group drafts with fixed safe policies in one transaction', () => {
    expect(source).toContain("conditionType: 'MANUAL_APPROVAL'");
    expect(source).toContain("visibilityPolicy: 'GROUP'");
    expect(source).toContain("rewardPolicy: { type: 'NONE' }");
    expect(source).toContain('GROUP_BADGE_CREATED_AND_SUBMITTED');
    expect(source).toContain('tx.groupMembership.findFirst');
  });
  it('does not read private content for approval', () => {
    expect(source).not.toContain('ownerKnowledge');
    expect(source).not.toContain('bunshinMemory');
    expect(source).not.toContain('missionContent');
  });
});
