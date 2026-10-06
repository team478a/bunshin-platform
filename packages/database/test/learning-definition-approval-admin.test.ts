import { describe, expect, it } from 'vitest';
import { validateLearningDefinitionApprovalCommand } from '../src/learning-definition-approval-admin';
const command = {
  operationId: '11111111-1111-4111-8111-111111111111',
  definitionKey: 'PROMPT_STRUCTURE',
  version: 'AI_TRAINING_DEFINITION_FIXTURE_V1',
  expectedRevision: 'a'.repeat(64),
  reviewDigest: 'b'.repeat(64),
  reviewEvidenceKey: 'synthetic-review',
  reviewedCommitSha: 'c'.repeat(40),
  action: 'APPROVE' as const,
  confirmation: 'CONFIRM_DEFINITION_APPROVAL' as const,
  reviewChecklist: {
    objective: true as const,
    prerequisites: true as const,
    concepts: true as const,
    safety: true as const,
    mistakes: true as const,
    practice: true as const,
    rubricAndMission: true as const,
  },
};
describe('Definition approval command safety', () => {
  it('requires human checklist and confirmation with no arbitrary content', () => {
    expect(validateLearningDefinitionApprovalCommand(command)).toEqual(command);
    expect(() =>
      validateLearningDefinitionApprovalCommand({ ...command, reviewChecklist: undefined }),
    ).toThrow();
    expect(() =>
      validateLearningDefinitionApprovalCommand({
        ...command,
        reviewEvidenceKey: undefined,
      } as unknown as typeof command),
    ).toThrow();
    expect(() =>
      validateLearningDefinitionApprovalCommand({
        ...command,
        prompt: 'private',
      } as typeof command),
    ).toThrow();
  });
  it('projects in stable order for immutable replay', () => {
    const reordered = Object.fromEntries(Object.entries(command).reverse()) as typeof command;
    expect(JSON.stringify(validateLearningDefinitionApprovalCommand(reordered))).toBe(
      JSON.stringify(validateLearningDefinitionApprovalCommand(command)),
    );
  });
  it('withdrawal must be explicit and cannot carry an approval checklist', () => {
    const { reviewChecklist, ...fields } = command;
    expect(reviewChecklist.safety).toBe(true);
    const withdrawal = {
      ...fields,
      action: 'DEPRECATE' as const,
      confirmation: 'CONFIRM_DEFINITION_WITHDRAWAL' as const,
    };
    expect(validateLearningDefinitionApprovalCommand(withdrawal)).toEqual(withdrawal);
    expect(() =>
      validateLearningDefinitionApprovalCommand({ ...command, action: 'DEPRECATE' }),
    ).toThrow();
  });
});
