import { describe, expect, it } from 'vitest';
import {
  buildFortuneDeepReadingDetails,
  fortuneDeepReadingEnabled,
  parseFortuneReviewedItems,
  validateFortuneReadingOutput,
} from '../src';

const confirmed = [
  { field: 'CONSULTATION', source: 'CONSULTATION', state: 'CONFIRMED', text: '働き方を見直したい' },
  { field: 'VALUES', source: 'ANSWER', state: 'CONFIRMED', text: '家族との時間' },
] as const;
const proposal = {
  alternatives: ['今の働き方で変更できる点を考える', '新しい働き方の条件を整理する'],
  actionReason: '選ぶ前に優先順位を見直せます',
};
const base = {
  body: '無理なく試すことから始められそうです。',
  actionStep: '譲れない条件を一つ書き出す。',
};

describe('Fortune deep reading contract', () => {
  it('uses only distinct confirmed fields and preserves what the participant said', () => {
    const items = parseFortuneReviewedItems(confirmed);
    if (!items) throw new Error('expected confirmed fields');
    expect(buildFortuneDeepReadingDetails(items, proposal)).toEqual({
      consultationSummary: '働き方を見直したい',
      importantValue: '家族との時間',
      ...proposal,
    });
    expect(parseFortuneReviewedItems([confirmed[0], confirmed[0]])).toBeNull();
    expect(parseFortuneReviewedItems([{ ...confirmed[0], state: 'INFERRED' }])).toBeNull();
    expect(buildFortuneDeepReadingDetails(items.slice(0, 1), proposal).importantValue).toBeNull();
  });

  it('requires the structured parts only for deep generation and rejects unsafe proposal text', () => {
    expect(validateFortuneReadingOutput(base)).toEqual(base);
    expect(() => validateFortuneReadingOutput(base, true)).toThrow(/深層鑑定/);
    expect(validateFortuneReadingOutput({ ...base, deep: proposal }, true)).toEqual({
      ...base,
      deep: proposal,
    });
    expect(() =>
      validateFortuneReadingOutput({
        ...base,
        deep: { ...proposal, alternatives: [proposal.alternatives[0]!, proposal.alternatives[0]!] },
      }),
    ).toThrow(/規定外/);
    expect(() =>
      validateFortuneReadingOutput({
        ...base,
        deep: { ...proposal, actionReason: 'https://example.invalid を見てください。' },
      }),
    ).toThrow();
    expect(() =>
      validateFortuneReadingOutput({
        ...base,
        deep: { ...proposal, alternatives: ['絶対に成功する'] },
      }),
    ).toThrow();
  });

  it('is off for existing settings and requires the existing intake flag', () => {
    expect(fortuneDeepReadingEnabled({ intake: { enabled: true } })).toBe(false);
    expect(fortuneDeepReadingEnabled({ deepReadingEnabled: true })).toBe(false);
    expect(fortuneDeepReadingEnabled({ intake: { enabled: true }, deepReadingEnabled: true })).toBe(
      true,
    );
  });
});
