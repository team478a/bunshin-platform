import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/training-toolkit.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

describe('AI training toolkit boundary', () => {
  it('stores an explicit immutable snapshot once per evaluated answer', () => {
    expect(schema).toContain('model TrainingToolkitItem');
    expect(schema).toContain('trainingMissionAnswerId String   @unique');
    expect(schema).toContain('contentSnapshot');
    expect(source).toContain("evaluationStatus: 'READY'");
    expect(source).toContain("answer.evaluation['result'] !== 'PASS'");
    expect(source).toContain('contentSnapshot: answer.answer');
  });

  it('isolates list and save operations to the participant enrollment', () => {
    expect(source).toContain('workspaceId: input.workspaceId');
    expect(source).toContain('groupId: input.groupId');
    expect(source).toContain('userId: input.actorUserId');
    expect(source).toContain("serviceRole: 'PARTICIPANT'");
    expect(source).toContain('groupMembershipId: membership.id');
    expect(source).toContain('programEnrollmentId: enrollment.id');
  });

  it('records an idempotent audit event with serializable persistence', () => {
    expect(source).toContain("eventType: 'TRAINING_TOOLKIT_ITEM_SAVED'");
    expect(source).toContain("sourceResourceType: 'TRAINING_TOOLKIT_ITEM'");
    expect(source).toContain('idempotencyKey: input.idempotencyKey');
    expect(source).toContain("{ isolationLevel: 'Serializable' }");
  });
});
