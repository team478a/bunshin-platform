import { describe, expect, it } from 'vitest';
import {
  buildFortuneUnderstanding,
  confirmedFortuneUnderstanding,
  FORTUNE_INTAKE_KEYS,
  fortuneUnderstandingConsultation,
  parseConfirmedFortuneUnderstanding,
} from '../src';

describe('Fortune structured understanding', () => {
  it('keeps input verbatim, distinguishes a suggested goal, and uses confirmed text only', () => {
    const items = buildFortuneUnderstanding('WORK', '仕事を辞めるか迷う', [
      { key: 'VALUES', answer: '家族との生活を大切にしたい' },
      { key: 'REASON', answer: null },
    ]);
    expect(items).toContainEqual({ field: 'REASON', state: 'UNKNOWN' });
    expect(items).toContainEqual({
      field: 'GOAL',
      state: 'INFERRED',
      source: 'THEME',
      text: '仕事について、今後の選択肢を整理したい',
    });
    expect(confirmedFortuneUnderstanding(items)).toEqual([
      {
        field: 'CONSULTATION',
        state: 'CONFIRMED',
        text: '仕事を辞めるか迷う',
        source: 'CONSULTATION',
      },
      { field: 'VALUES', state: 'CONFIRMED', text: '家族との生活を大切にしたい', source: 'ANSWER' },
    ]);
    expect(fortuneUnderstandingConsultation(items)).toBe(
      '仕事を辞めるか迷う\n【大切なこと】家族との生活を大切にしたい',
    );
  });

  it('does not infer a goal from the theme alone or after an explicit skip', () => {
    expect(
      buildFortuneUnderstanding('WORK', '', []).every(({ state }) => state === 'UNKNOWN'),
    ).toBe(true);
    expect(
      buildFortuneUnderstanding('WORK', '相談あり', [{ key: 'GOAL', answer: null }]),
    ).toContainEqual({ field: 'GOAL', state: 'UNKNOWN' });
  });

  it('fits all bounded answers into the existing consultation format and rejects unconfirmed records', () => {
    const items = buildFortuneUnderstanding(
      'WORK',
      'あ'.repeat(200),
      FORTUNE_INTAKE_KEYS.map((key) => ({ key, answer: 'あ'.repeat(50) })),
    );
    expect(fortuneUnderstandingConsultation(items).length).toBeLessThanOrEqual(500);
    expect(
      parseConfirmedFortuneUnderstanding({
        field: 'GOAL',
        source: 'THEME',
        state: 'INFERRED',
        text: '候補',
      }),
    ).toBeNull();
    expect(
      parseConfirmedFortuneUnderstanding({
        field: 'VALUES',
        source: 'CORRECTION',
        state: 'CONFIRMED',
        text: 'あ'.repeat(51),
      }),
    ).toBeNull();
  });
});
