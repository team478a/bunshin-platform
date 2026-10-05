import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/training-interaction.ts', import.meta.url), 'utf8');

describe('AI training interaction boundary', () => {
  it('scopes every interaction to the active participant and current assignment', () => {
    expect(source).toContain('workspaceId: input.workspaceId');
    expect(source).toContain('groupId: input.groupId');
    expect(source).toContain('userId: input.actorUserId');
    expect(source).toContain("serviceRole: 'PARTICIPANT'");
    expect(source).toContain('groupMembershipId: membership.id');
    expect(source).toContain('programEnrollmentId: enrollment.id');
    expect(source).toContain("actionMode: 'WORK'");
    expect(source).toContain("status: { in: ['PRESENTED', 'STARTED'] }");
  });

  it('records an idempotent event without storing user input', () => {
    expect(source).toContain('eventType: input.interactionType');
    expect(source).toContain("sourceResourceType: 'PROGRAM_MISSION_ASSIGNMENT'");
    expect(source).toContain('idempotencyKey: input.idempotencyKey');
    expect(source).toContain("{ isolationLevel: 'Serializable' }");
    expect(source).not.toContain('message: input.');
  });

  it('stores a bounded reminder time when the participant chooses later', () => {
    expect(source).toContain("input.interactionType === 'TRAINING_POSTPONED'");
    expect(source).toContain('parseAiTrainingOperationsSettings(program.settings)');
    expect(source).toContain('.postponedReminderHours');
    expect(source).toContain('remindAt: new Date(');
  });

  it('fails closed unless the limited-service skill scope and active version match', () => {
    expect(source).toContain('parseTrainingSupportSkillExposurePilotSettings(input.settings)');
    expect(source).toContain('if (!pilot.enabled) return null');
    expect(source).toContain('programTemplateVersionId: input.programTemplateVersionId');
    expect(source).toContain('missionDefinitionKey: input.missionDefinitionKey');
    expect(source).toContain('assignmentVariant: input.assignmentVariant');
    expect(source).toContain("operationalStatus: 'ACTIVE'");
    expect(source).toContain("disposition: 'ACTIVE'");
    expect(source).toContain('if (candidates.length !== 1');
  });

  it('records presentation provenance without copying support content into metadata', () => {
    expect(source).toContain('TRAINING_SUPPORT_SKILL_PRESENTED_EVENT');
    expect(source).toContain("sourceResourceType: 'PROGRAM_ACTION_EVENT'");
    expect(source).toContain('trainingSupportSkillId: skill.id');
    expect(source).toContain('skillVersionId: version.id');
    expect(source).toContain('activationId: activation.id');
    expect(source).not.toContain('steps: steps');
    expect(source).not.toContain('expectedOutput: version.expectedOutput,\n        presentedAt');
  });
});
