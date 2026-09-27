import { describe, expect, it } from 'vitest';
import { selectSocialActivityOemSupportRecommendation } from '../src/activity-barrier-oem-support';

const eligible = {
  supportCompletedAt: new Date('2026-09-01T00:00:00.000Z'),
  observationFrom: new Date('2026-09-02T00:00:00.000Z'),
  observationTo: new Date('2026-09-20T00:00:00.000Z'),
  eligibleDays: 18,
  excludedSystemIncidentDays: 0,
};

describe('selectSocialActivityOemSupportRecommendation', () => {
  it('offers a scoped recommendation only after free support and clean re-observation', () => {
    expect(
      selectSocialActivityOemSupportRecommendation({ ...eligible, category: 'MEDIA' }),
    ).toMatchObject({
      key: 'MEDIA_PRODUCTION_SUPPORT',
      reasonCode: 'CONFIRMED_BARRIER_PERSISTED_AFTER_FREE_SUPPORT',
    });
  });

  it.each([
    ['observation includes pre-support activity', { observationFrom: new Date('2026-08-30') }],
    ['too few eligible days', { eligibleDays: 13 }],
    ['system incident exists', { excludedSystemIncidentDays: 1 }],
  ])('does not create a candidate when %s', (_label, override) => {
    expect(
      selectSocialActivityOemSupportRecommendation({ ...eligible, category: 'MEDIA', ...override }),
    ).toBeNull();
  });

  it('does not commercialize CONTENT because system personalization quality must be reviewed first', () => {
    expect(
      selectSocialActivityOemSupportRecommendation({ ...eligible, category: 'CONTENT' }),
    ).toBeNull();
  });
});
