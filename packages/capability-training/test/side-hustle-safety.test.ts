import { describe, expect, it } from 'vitest';

import {
  SIDE_HUSTLE_COMMON_NOTICES,
  SIDE_HUSTLE_EXCLUDED_AREAS,
  GUARANTEE_EXPRESSIONS,
  findSideHustleExcludedArea,
  findSideHustleGuaranteeExpression,
} from '../src/index';

describe('side hustle safety', () => {
  it('contains eight areas without duplicate keys or keywords', () => {
    expect(SIDE_HUSTLE_EXCLUDED_AREAS).toHaveLength(8);
    const keys = SIDE_HUSTLE_EXCLUDED_AREAS.map(({ key }) => key);
    const keywords = SIDE_HUSTLE_EXCLUDED_AREAS.flatMap(({ keywords }) => keywords);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(keywords).size).toBe(keywords.length);
  });

  it.each(SIDE_HUSTLE_EXCLUDED_AREAS)('detects every keyword for $key', (area) => {
    for (const keyword of area.keywords) {
      expect(findSideHustleExcludedArea(`候補は${keyword}を扱います`)?.key).toBe(area.key);
    }
  });

  it.each(['FX', 'fx', 'ＦＸ', 'ｆｘ'])('normalizes Latin width and case for %s', (value) => {
    expect(findSideHustleExcludedArea(value)?.key).toBe('INVESTMENT_SPECULATION');
  });

  it.each([
    'ハンドメイドの材料を仕入れる',
    '自己投資として講座を受ける',
    'ブログで投資の基礎知識を学ぶ',
  ])('does not reject the legitimate example %s', (value) => {
    expect(findSideHustleExcludedArea(value)).toBeNull();
  });

  it.each(GUARANTEE_EXPRESSIONS)('detects guarantee expression %s', (value) => {
    expect(findSideHustleGuaranteeExpression(`これは${value}という表現です`)).toBe(value);
  });

  it('exposes the three exact common notices', () => {
    expect(SIDE_HUSTLE_COMMON_NOTICES).toEqual([
      {
        kind: 'EMPLOYMENT',
        text: '勤務先の就業規則で副業が認められているか、始める前に確認してください。',
      },
      {
        kind: 'TAX',
        text: '収入が出た場合の申告の要否は、税務署や税理士に確認してください。',
      },
      {
        kind: 'ESTIMATE',
        text: '費用・時間・注意点はAIによる一般的な目安です。始める前にご自身でも確認してください。',
      },
    ]);
  });
});
