import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/training-growth.ts', import.meta.url), 'utf8');

describe('AI training growth boundary', () => {
  it('isolates every projection input to the participant enrollment', () => {
    expect(source).toContain('workspaceId: input.workspaceId');
    expect(source).toContain('groupId: input.groupId');
    expect(source).toContain('userId: input.actorUserId');
    expect(source).toContain("serviceRole: 'PARTICIPANT'");
    expect(source).toContain('groupMembershipId: membership.id');
    expect(source).toContain('programEnrollmentId: enrollment.id');
    expect(source).toContain('actorUserId: input.actorUserId');
  });

  it('reuses skill, progress, assignment and action event projections', () => {
    expect(source).toContain('trainingParticipantProfile.findFirst');
    expect(source).toContain('programProgressSnapshot.findFirst');
    expect(source).toContain('programMissionAssignment.findMany');
    expect(source).toContain('programActionEvent.findMany');
    expect(source).toContain('buildTrainingGrowthSummary');
  });
});
