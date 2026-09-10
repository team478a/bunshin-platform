import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  editorialSlidesForMission,
  isAutomaticDailyImageEligible,
} from '../src/services/automatic-daily-image';

describe('automatic daily image eligibility', () => {
  it('uses all five prepared pages for image-plan generation', () => {
    const slides = Array.from({ length: 5 }, (_, index) => ({
      index: index + 1,
      role: ['HOOK', 'PROBLEM', 'INSIGHT', 'SOLUTION', 'CTA'][index],
      headline: `見出し${index + 1}`,
      body: `本文${index + 1}`,
    }));

    expect(editorialSlidesForMission({ format: 'IMAGE', content: { slides } })).toHaveLength(5);
  });

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
