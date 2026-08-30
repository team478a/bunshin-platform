import { describe, expect, it } from 'vitest';
import { buildServiceOnboardingAnswers } from '../src/services/service-onboarding-response';

describe('service onboarding response', () => {
  it('keeps the question snapshot with trimmed answers', () => {
    expect(
      buildServiceOnboardingAnswers(['使うSNSは？', '目標は？'], [' X ', '週3回投稿']),
    ).toEqual([
      { question: '使うSNSは？', answer: 'X' },
      { question: '目標は？', answer: '週3回投稿' },
    ]);
  });

  it('rejects missing or mismatched answers', () => {
    expect(() => buildServiceOnboardingAnswers(['目標は？'], [])).toThrow(
      'ONBOARDING_ANSWERS_INVALID',
    );
    expect(() => buildServiceOnboardingAnswers(['目標は？'], ['   '])).toThrow(
      'ONBOARDING_ANSWERS_INVALID',
    );
  });
});
