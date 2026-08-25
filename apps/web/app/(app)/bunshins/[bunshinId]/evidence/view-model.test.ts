import { describe, expect, it } from 'vitest';
import { parseOfficialClaims } from './view-model';

describe('広告安全確認画面', () => {
  it('商品事実の入力を構造化する', () => {
    expect(parseOfficialClaims('価格=1000円\n期間=8月末まで')).toEqual({
      価格: '1000円',
      期間: '8月末まで',
    });
  });
  it('形式が違う行を送信しない', () => {
    expect(parseOfficialClaims('説明だけ\n価格=')).toEqual({});
  });
});
