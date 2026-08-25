import { describe, expect, it } from 'vitest';
import { parseProductPackFacts, parseProductPackRules } from './view-model';

describe('公式商品パック管理画面', () => {
  it('1行1項目の入力を確認済み事実へ変換する', () => {
    expect(parseProductPackFacts('価格 = 月額1,000円\n対象 = 初心者')).toEqual({
      価格: '月額1,000円',
      対象: '初心者',
    });
  });

  it('形式が違う行と空の値を送信対象から除外する', () => {
    expect(parseProductPackFacts('説明だけ\n空=\n有効=内容')).toEqual({ 有効: '内容' });
  });

  it('必須表記・禁止表現・条件付き表記を安全規則へ変換する', () => {
    expect(
      parseProductPackRules({
        requiredDisclosures: '#PR\n提供を受けて紹介しています',
        forbiddenExpressions: '必ず治る',
        conditionalExpressions: '価格を書く=>税込表記\n形式違い',
      }),
    ).toEqual([
      { type: 'REQUIRED_DISCLOSURE', value: '#PR', condition: null },
      {
        type: 'REQUIRED_DISCLOSURE',
        value: '提供を受けて紹介しています',
        condition: null,
      },
      { type: 'FORBIDDEN_EXPRESSION', value: '必ず治る', condition: null },
      { type: 'CONDITIONAL_EXPRESSION', value: '税込表記', condition: '価格を書く' },
    ]);
  });
});
