import { describe, expect, it } from 'vitest';
import { createProgramProductTerms, parseProgramProductTerms } from '../src/program-commerce';

describe('program commerce terms', () => {
  it('creates a provider-independent direct purchase product', () => {
    expect(
      createProgramProductTerms({
        amountYen: 29_800,
        durationDays: 90,
        supportMode: 'GUIDED',
        timeZone: 'Asia/Tokyo',
      }),
    ).toEqual({
      schemaVersion: 1,
      productKind: 'PROGRAM_ACCESS',
      purchaseMode: 'DIRECT',
      amountYen: 29_800,
      currency: 'JPY',
      durationDays: 90,
      supportMode: 'GUIDED',
      timeZone: 'Asia/Tokyo',
    });
  });

  it('rejects invalid prices, periods and time zones', () => {
    expect(
      parseProgramProductTerms({
        schemaVersion: 1,
        productKind: 'PROGRAM_ACCESS',
        purchaseMode: 'DIRECT',
        amountYen: 0,
        currency: 'JPY',
        durationDays: 90,
        supportMode: 'GUIDED',
        timeZone: 'Asia/Tokyo',
      }),
    ).toBeNull();
    expect(
      parseProgramProductTerms({
        schemaVersion: 1,
        productKind: 'PROGRAM_ACCESS',
        purchaseMode: 'DIRECT',
        amountYen: 9_800,
        currency: 'JPY',
        durationDays: 90,
        supportMode: 'GUIDED',
        timeZone: 'Not/AZone',
      }),
    ).toBeNull();
  });
});
