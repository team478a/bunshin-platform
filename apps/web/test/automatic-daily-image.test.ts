import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { isAutomaticDailyImageEligible } from '../src/services/automatic-daily-image';

describe('automatic daily image eligibility', () => {
  it('allows only opted-in, ready-to-use image Missions in production', () => {
    expect(
      isAutomaticDailyImageEligible({
        mediaMode: 'IMAGE',
        assistanceLevel: 'READY_TO_USE',
        format: 'IMAGE',
        environment: 'PRODUCTION',
      }),
    ).toBe(true);
    expect(
      isAutomaticDailyImageEligible({
        mediaMode: 'IMAGE',
        assistanceLevel: 'READY_TO_USE',
        format: 'SLIDE',
        environment: 'PRODUCTION',
      }),
    ).toBe(true);
  });

  it.each([
    ['TEXT_ONLY', 'READY_TO_USE', 'IMAGE', 'PRODUCTION'],
    ['IMAGE', 'GUIDED', 'IMAGE', 'PRODUCTION'],
    ['IMAGE', 'READY_TO_USE', 'TEXT', 'PRODUCTION'],
    ['IMAGE', 'READY_TO_USE', 'IMAGE', 'STAGING'],
  ] as const)(
    'rejects media=%s assistance=%s format=%s environment=%s',
    (mediaMode, assistanceLevel, format, environment) => {
      expect(
        isAutomaticDailyImageEligible({ mediaMode, assistanceLevel, format, environment }),
      ).toBe(false);
    },
  );
});
