import { describe, expect, it } from 'vitest';
import { commercialMonthPeriod, quoteOemMauPrice } from '../src/commercial-usage';

describe('OEM MAU pricing', () => {
  it.each([
    [0, 'MAU_0_100', 19_800],
    [100, 'MAU_0_100', 19_800],
    [101, 'MAU_101_300', 39_800],
    [300, 'MAU_101_300', 39_800],
    [301, 'MAU_301_500', 59_800],
    [500, 'MAU_301_500', 59_800],
    [501, 'MAU_501_1000', 99_800],
    [1_000, 'MAU_501_1000', 99_800],
    [1_001, 'MAU_1001_3000', 198_000],
    [3_000, 'MAU_1001_3000', 198_000],
  ])('quotes %i MAU', (mau, tierKey, priceYen) => {
    expect(quoteOemMauPrice(mau)).toMatchObject({ tierKey, priceYen });
  });

  it('requires a custom quote over 3,000 MAU', () => {
    expect(quoteOemMauPrice(3_001)).toMatchObject({
      tierKey: 'CUSTOM',
      priceYen: null,
      customQuoteRequired: true,
    });
  });
});

describe('commercial month period', () => {
  it('uses a half-open Asia/Tokyo calendar month', () => {
    expect(commercialMonthPeriod(new Date('2026-09-30T18:00:00.000Z'))).toEqual({
      key: '2026-10',
      start: new Date('2026-09-30T15:00:00.000Z'),
      end: new Date('2026-10-31T15:00:00.000Z'),
      timeZone: 'Asia/Tokyo',
    });
  });

  it('returns the previous calendar month', () => {
    expect(commercialMonthPeriod(new Date('2026-01-15T00:00:00.000Z'), -1).key).toBe('2025-12');
  });
});
