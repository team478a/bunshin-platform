import { describe, expect, it } from 'vitest';
import {
  serviceCreditAmountLabel,
  serviceCreditLedgerSummary,
} from '../src/services/service-credit-balance';

describe('service credit balance presentation', () => {
  it('uses plain Japanese labels for referral credits', () => {
    expect(
      serviceCreditLedgerSummary({
        type: 'GRANT',
        sourceType: 'REFERRAL',
        amount: 2,
        expiresAt: null,
      }),
    ).toBe('紹介特典');
    expect(serviceCreditAmountLabel({ type: 'GRANT', amount: 2 })).toBe('+2回');
  });

  it('explains credit use without exposing internal source names', () => {
    expect(
      serviceCreditLedgerSummary({
        type: 'CONSUME',
        sourceType: 'SYSTEM',
        amount: -1,
        expiresAt: null,
      }),
    ).toBe('画像作成に使いました');
    expect(serviceCreditAmountLabel({ type: 'CONSUME', amount: -1 })).toBe('-1回');
  });
});
