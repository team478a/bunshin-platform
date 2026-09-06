import { describe, expect, it } from 'vitest';
import { SERVICE_REFERRAL_CONTENT_DISCLOSURE, createServiceReferralContent } from '../src';

describe('service referral content', () => {
  it('creates separately tracked manual-post content with disclosure', () => {
    const result = createServiceReferralContent({
      serviceName: '千ノ国メディア',
      serviceDescription: 'SNS投稿に使えるコンテンツをお届けします。',
      referralUrl: 'https://www.watashi-works.com/r/ABC123',
      platform: 'INSTAGRAM',
    });

    expect(result.body).toContain('千ノ国メディアをご紹介します。');
    expect(result.body).toContain(SERVICE_REFERRAL_CONTENT_DISCLOSURE);
    expect(result.body).toContain('/r/ABC123?source=member_share&content=instagram');
    expect(result.characterCount).toBeLessThanOrEqual(result.characterLimit);
  });

  it('fits X content within its limit even with a long description', () => {
    const result = createServiceReferralContent({
      serviceName: '副業サポート',
      serviceDescription: 'あ'.repeat(1_000),
      referralUrl: 'https://example.jp/r/ABC123',
      platform: 'X',
    });

    expect(result.characterLimit).toBe(280);
    expect(result.body.length).toBeLessThanOrEqual(280);
    expect(result.body).toContain('#PR');
    expect(result.body).toContain('content=x');
  });

  it.each([
    'http://example.jp/r/ABC123',
    'https://example.jp/item/ABC123',
    'https://user:secret@example.jp/r/ABC123',
  ])('rejects a URL outside the service referral route: %s', (referralUrl) => {
    expect(() =>
      createServiceReferralContent({
        serviceName: '千ノ国メディア',
        referralUrl,
        platform: 'THREADS',
      }),
    ).toThrow();
  });
});
