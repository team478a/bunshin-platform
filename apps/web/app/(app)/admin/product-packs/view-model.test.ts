import { describe, expect, it } from 'vitest';
import { parseProductPackFacts } from './view-model';

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
});
