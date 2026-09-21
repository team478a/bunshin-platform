import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/training-profile.ts', import.meta.url), 'utf8');

describe('AI training participant profile boundary', () => {
  it('scopes profile writes to the active participant, service and enrollment', () => {
    expect(source).toContain('workspaceId: input.workspaceId');
    expect(source).toContain('groupId: input.groupId');
    expect(source).toContain('userId: input.actorUserId');
    expect(source).toContain("serviceRole: 'PARTICIPANT'");
    expect(source).toContain('groupMembershipId: membership.id');
    expect(source).toContain('programEnrollmentId: enrollment.id');
    expect(source).toContain(
      "settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY }",
    );
  });

  it('records the assessment, existing goal model and an idempotent audit event', () => {
    expect(source).toContain('tx.programMemberGoal.create');
    expect(source).toContain("eventType: 'TRAINING_INITIAL_ASSESSMENT_COMPLETED'");
    expect(source).toContain("sourceResourceType: 'TRAINING_PARTICIPANT_PROFILE'");
    expect(source).toContain('idempotencyKey: input.idempotencyKey');
    expect(source).toContain("{ isolationLevel: 'Serializable' }");
  });
});
