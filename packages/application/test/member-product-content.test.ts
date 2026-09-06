import { describe, expect, it } from 'vitest';
import { createMemberProductContent } from '../src';

describe('member product content', () => {
  it('creates disclosed copy with the approved member URL', () => {
    const result = createMemberProductContent({
      productName: 'サンプル商品',
      appealPoint: '毎日の活動に取り入れやすい商品です。',
      targetAudience: '新しい習慣を始めたい方',
      approvedUrl: 'https://shop.example.jp/item/1?ref=member-1',
      platform: 'INSTAGRAM',
    });

    expect(result.body).toContain('サンプル商品についてご紹介します。');
    expect(result.body).toContain('新しい習慣を始めたい方');
    expect(result.body).toContain('#PR');
    expect(result.body).toContain('https://shop.example.jp/item/1?ref=member-1');
  });

  it('keeps X copy within the platform limit', () => {
    const result = createMemberProductContent({
      productName: 'サンプル商品',
      appealPoint: 'あ'.repeat(280),
      approvedUrl: 'https://shop.example.jp/item/1?ref=member-1',
      platform: 'X',
    });

    expect(result.characterLimit).toBe(280);
    expect(result.body.length).toBeLessThanOrEqual(280);
    expect(result.body).toContain('#PR');
    expect(result.body).toContain('https://shop.example.jp/item/1?ref=member-1');
  });

  it.each([
    'http://shop.example.jp/item/1',
    'https://user:secret@shop.example.jp/item/1',
    'https://shop.example.jp/item/1#member',
  ])('rejects an unsafe member URL: %s', (approvedUrl) => {
    expect(() =>
      createMemberProductContent({
        productName: 'サンプル商品',
        appealPoint: '確認済みの特徴です。',
        approvedUrl,
        platform: 'THREADS',
      }),
    ).toThrow();
  });
});
