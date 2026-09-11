import { describe, expect, it } from 'vitest';
import { getRewardsPilotExpiryNotice } from '../src/rewards/rewards-pilot-expiry';

describe('rewards pilot expiry notice', () => {
  const now = new Date('2026-09-11T00:00:00.000Z');

  it('shows the notice throughout the final seven days', () => {
    expect(getRewardsPilotExpiryNotice(new Date('2026-09-18T00:00:00.000Z'), now)).toMatchObject({
      daysRemaining: 7,
    });
    expect(getRewardsPilotExpiryNotice(new Date('2026-09-11T00:01:00.000Z'), now)).toMatchObject({
      daysRemaining: 1,
    });
  });

  it('does not show for a later, expired, or unlimited period', () => {
    expect(getRewardsPilotExpiryNotice(new Date('2026-09-18T00:00:01.000Z'), now)).toBeNull();
    expect(getRewardsPilotExpiryNotice(new Date('2026-09-11T00:00:00.000Z'), now)).toBeNull();
    expect(getRewardsPilotExpiryNotice(null, now)).toBeNull();
  });
});
