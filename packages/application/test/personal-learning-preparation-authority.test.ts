import { describe, expect, it } from 'vitest';
import { parsePersonalLearningPreparationAuthority } from '../src/personal-learning-preparation-authority';
const authority = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  serviceProgramId: '33333333-3333-4333-8333-333333333333',
};
describe('server-owned preparation authority', () => {
  it('accepts only exact immutable scope without implicit defaults', () => {
    const parsed = parsePersonalLearningPreparationAuthority(authority);
    expect(parsed).toEqual(authority);
    expect(Object.isFrozen(parsed)).toBe(true);
  });
  it.each([
    null,
    [],
    {},
    { ...authority, serviceProgramId: undefined },
    { ...authority, groupId: 'other' },
    { ...authority, userId: 'client' },
  ])('rejects unknown or malformed scope', (value) =>
    expect(parsePersonalLearningPreparationAuthority(value)).toBeNull(),
  );
});
