import { expect, it } from 'vitest';
import { remainingServiceCreditLots } from '../src/service-credit-lots';

it('removes a specific grant without consuming another grant with earlier expiry', () => {
  const common = { expiresAt: null, sourceId: null };
  const lots = remainingServiceCreditLots([
    { ...common, id: 'other', type: 'GRANT', amount: 4, expiresAt: new Date('2026-12-01') },
    { ...common, id: 'referral', type: 'GRANT', amount: 5 },
    { ...common, id: 'spend', type: 'CONSUME', amount: -2 },
    { ...common, id: 'revoke', type: 'ADJUST', amount: -5, sourceId: 'grant:referral' },
  ]);
  expect(lots.get('other')?.remaining).toBe(2);
  expect(lots.get('referral')?.remaining).toBe(0);
});
