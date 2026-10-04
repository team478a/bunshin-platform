import { describe, expect, it } from 'vitest';
import { socialGoalOutcomeCopy } from '../src/services/social-goal-outcome-copy';

describe('social goal outcome copy', () => {
  it.each([
    ['BRAND_AWARENESS', '新しく知ってもらえた', '新しい人から反応があった'],
    ['RECRUIT', '応募・見学・採用', '応募・見学の連絡があった'],
    ['TRUST_EXPERTISE', '信頼や専門性', '相談・依頼につながった'],
  ] as const)('asks for a concrete %s outcome', (goal, question, achievedLabel) => {
    const copy = socialGoalOutcomeCopy(goal, '表示名');

    expect(copy.question).toContain(question);
    expect(copy.options.find(({ result }) => result === 'ACHIEVED')?.label).toBe(achievedLabel);
    expect(copy.description).toContain('自動計測ではない');
  });

  it('keeps the existing four-state contract for other goals', () => {
    const copy = socialGoalOutcomeCopy('INQUIRY', '問い合わせ');

    expect(copy.question).toBe('今回の目的「問い合わせ」にはつながりましたか？');
    expect(copy.options.map(({ result }) => result)).toEqual([
      'ACHIEVED',
      'SOME_PROGRESS',
      'NO_CHANGE',
      'UNKNOWN',
    ]);
  });
});
