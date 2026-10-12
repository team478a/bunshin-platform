import { describe, expect, it } from 'vitest';
import { validateSavePersonalLearningRequest } from '../src/personal-learning-request';
const scope = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  groupId: '00000000-0000-4000-8000-000000000002',
  programEnrollmentId: '00000000-0000-4000-8000-000000000003',
  groupMembershipId: '00000000-0000-4000-8000-000000000004',
  userId: '00000000-0000-4000-8000-000000000005',
};
const input = {
  scope,
  actorUserId: scope.userId,
  idempotencyKey: 'operation',
  expectedRevision: 0,
  content: {
    originalText: ' AIでホームページを作りたい\n',
    deviceType: null,
    toolDescription: null,
    experienceDescription: null,
    currentPosition: null,
  },
};
describe('learning request contract', () => {
  it('allows unknown context without changing original text', () => {
    expect(() => validateSavePersonalLearningRequest(input)).not.toThrow();
    expect(input.content.originalText).toBe(' AIでホームページを作りたい\n');
  });
  it('rejects extra content fields, including scope injection', () => {
    expect(() =>
      validateSavePersonalLearningRequest({
        ...input,
        content: { ...input.content, userId: 'foreign' },
      } as typeof input),
    ).toThrow();
  });
  it.each([-1, 1.5, 2147483647, NaN])('rejects invalid expected revision', (expectedRevision) => {
    expect(() => validateSavePersonalLearningRequest({ ...input, expectedRevision })).toThrow();
  });
  it('rejects empty wish and wrong actor', () => {
    expect(() =>
      validateSavePersonalLearningRequest({
        ...input,
        content: { ...input.content, originalText: '  ' },
      }),
    ).toThrow();
    expect(() =>
      validateSavePersonalLearningRequest({ ...input, actorUserId: scope.groupId }),
    ).toThrow();
  });
});
