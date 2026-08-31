import { describe, expect, it } from 'vitest';
import {
  buildServiceOnboardingAnswers,
  readServiceOnboardingAnswers,
  serviceOnboardingProposalContext,
} from '../src/services/service-onboarding-response';

describe('service onboarding response', () => {
  it('keeps the question snapshot with trimmed answers', () => {
    expect(
      buildServiceOnboardingAnswers(['使うSNSは？', '目標は？'], [' X ', '週3回投稿']),
    ).toEqual([
      { question: '使うSNSは？', answer: 'X' },
      { question: '目標は？', answer: '週3回投稿' },
    ]);
  });

  it('reads only safe question and answer pairs for proposal context', () => {
    const answers = readServiceOnboardingAnswers([
      { question: '目的は？', answer: '投稿を続けたい', secret: 'ignored' },
      { question: 1, answer: 'invalid' },
    ]);
    expect(answers).toEqual([{ question: '目的は？', answer: '投稿を続けたい' }]);
    expect(serviceOnboardingProposalContext(answers)).toBe('質問：目的は？\n回答：投稿を続けたい');
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
