import { describe, expect, it } from 'vitest';
import { validatePersonalLearningPilotProfileCommand } from '../src/personal-learning-pilot-profile';
const c = {
  operationId: '11111111-1111-4111-8111-111111111111',
  role: 'OTHER' as const,
  aiLevel: 'BEGINNER' as const,
  dailyMinutes: 5 as const,
  confirmation: 'CONFIRM_MY_LEARNING_PROFILE' as const,
  expectedAbsent: true as const,
};
describe('Pilot profile initialization contract', () => {
  it('requires all explicit answers and cannot default UNKNOWN to beginner', () => {
    expect(validatePersonalLearningPilotProfileCommand(c)).toEqual(c);
    for (const key of ['role', 'aiLevel', 'dailyMinutes', 'confirmation', 'expectedAbsent']) {
      const value = Object.fromEntries(Object.entries(c).filter(([k]) => k !== key));
      expect(() => validatePersonalLearningPilotProfileCommand(value as typeof c)).toThrow();
    }
    const unknown = { ...c, aiLevel: 'UNKNOWN' };
    expect(() => validatePersonalLearningPilotProfileCommand(unknown as typeof c)).toThrow();
  });
  it('rejects free text and unrelated fields; projects stable command ordering', () => {
    const value = { ...c, businessContext: 'private' };
    expect(() => validatePersonalLearningPilotProfileCommand(value)).toThrow();
    const reordered = Object.fromEntries(Object.entries(c).reverse()) as typeof c;
    expect(JSON.stringify(validatePersonalLearningPilotProfileCommand(reordered))).toBe(
      JSON.stringify(validatePersonalLearningPilotProfileCommand(c)),
    );
  });
});
