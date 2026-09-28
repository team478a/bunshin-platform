import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/training-barrier.ts', import.meta.url), 'utf8');

describe('AI training barrier boundary', () => {
  it('scopes changes to the active participant and assignment', () => {
    expect(source).toContain('workspaceId: input.workspaceId');
    expect(source).toContain('groupId: input.groupId');
    expect(source).toContain('userId: input.actorUserId');
    expect(source).toContain("serviceRole: 'PARTICIPANT'");
    expect(source).toContain('groupMembershipId: membership.id');
    expect(source).toContain('programEnrollmentId: enrollment.id');
    expect(source).toContain("actionMode: 'WORK'");
    expect(source).toContain("status: { in: ['PRESENTED', 'STARTED'] }");
  });

  it('prevents adjustment after an answer exists and writes only structured metadata', () => {
    expect(source).toContain('tx.trainingMissionAnswer.findFirst');
    expect(source).toContain('if (answer) return');
    expect(source).toContain('barrierReason: input.action.reason');
    expect(source).not.toContain('freeText');
    expect(source).not.toContain('answer: input.');
  });

  it('uses a serializable idempotent transaction', () => {
    expect(source).toContain('idempotencyKey: input.idempotencyKey');
    expect(source).toContain("{ isolationLevel: 'Serializable' }");
    expect(source).toContain("['P2002', 'P2034']");
  });
});
