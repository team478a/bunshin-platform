import { describe, expect, it } from 'vitest';
import { parsePersonalLearningCallAdmissionPolicy } from '../src/personal-learning-call-admission';
const policy = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  groupId: '00000000-0000-4000-8000-000000000002',
  serviceProgramId: '00000000-0000-4000-8000-000000000003',
  model: 'synthetic',
  dailyAttemptLimit: 2,
  maxConcurrent: 1,
  maxRequestBytes: 10000,
  maxOutputTokens: 100,
};
describe('Pilot admission policy', () => {
  it('accepts only an explicit immutable policy', () => {
    const parsed = parsePersonalLearningCallAdmissionPolicy(policy);
    expect(parsed).toEqual(policy);
    expect(Object.isFrozen(parsed)).toBe(true);
  });
  it.each([
    null,
    {},
    [],
    { ...policy, extra: true },
    { ...policy, dailyAttemptLimit: 0 },
    { ...policy, maxConcurrent: 3 },
    { ...policy, maxOutputTokens: 15 },
    { ...policy, maxRequestBytes: NaN },
    { ...policy, model: ' secret ' },
    { ...policy, workspaceId: 'other' },
  ])('fails closed for invalid configuration', (input) => {
    expect(parsePersonalLearningCallAdmissionPolicy(input)).toBeNull();
  });
});
