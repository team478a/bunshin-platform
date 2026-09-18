import { describe, expect, it } from 'vitest';
import { buildAiResaleOfferLineMessage } from '../src/line-offer';

describe('AI resale offer LINE message', () => {
  it('includes the DAY7 result, saved price, duration, and offer URL', () => {
    const message = buildAiResaleOfferLineMessage({
      serviceName: 'ワタシワークス公式',
      classification: 'LISTED',
      offerKind: 'STANDARD',
      amountYen: 29_800,
      durationDays: 90,
      offerUrl: 'https://www.watashi-works.com/s/official/programs/enrollment-1',
    });

    expect(message).toContain('7日間のAI副業体験が完了しました。');
    expect(message).toContain('出品できた流れを、販売につながる形へ整えます');
    expect(message).toContain('90日プログラム：29,800円（一括）');
    expect(message).toContain('利用期間：90日間');
    expect(message).toContain('https://www.watashi-works.com/s/official/programs/enrollment-1');
  });

  it('uses the monitor label and rejects an insecure production URL', () => {
    expect(
      buildAiResaleOfferLineMessage({
        serviceName: 'ワタシワークス公式',
        classification: 'PARTIAL',
        offerKind: 'MONITOR',
        amountYen: 9_800,
        durationDays: 90,
        offerUrl: 'https://www.watashi-works.com/offer',
      }),
    ).toContain('90日モニタープラン：9,800円（一括）');

    expect(() =>
      buildAiResaleOfferLineMessage({
        serviceName: 'ワタシワークス公式',
        classification: 'NOT_STARTED',
        offerKind: 'STANDARD',
        amountYen: 29_800,
        durationDays: 90,
        offerUrl: 'http://example.com/offer',
      }),
    ).toThrow('offerUrl must use HTTPS');
  });
});
