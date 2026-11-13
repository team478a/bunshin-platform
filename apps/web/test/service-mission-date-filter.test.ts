import { describe, expect, it } from 'vitest';
import {
  splitServiceMissionsByDate,
  splitServiceMissionsBySource,
} from '../app/s/[serviceSlug]/bunshins/[bunshinId]/service-mission-date-filter';

describe('service mission dates', () => {
  it('shows only the service-local current day in the today section', () => {
    const missions = [
      { id: 'future', missionDate: '2026-10-01' },
      { id: 'today', missionDate: '2026-09-30' },
      { id: 'past', missionDate: '2026-09-28' },
    ];
    const result = splitServiceMissionsByDate(missions, '2026-09-30');

    expect(result.todayMissions.map(({ id }) => id)).toEqual(['today']);
    expect(result.pastMissions.map(({ id }) => id)).toEqual(['past']);
  });

  it('keeps multiple posts on the same date together', () => {
    const missions = [
      { id: 'first', missionDate: '2026-09-28' },
      { id: 'second', missionDate: '2026-09-28' },
    ];
    const result = splitServiceMissionsByDate(missions, '2026-09-30');

    expect(result.todayMissions).toEqual([]);
    expect(result.pastMissions).toEqual(missions);
  });
});

describe('service mission sources', () => {
  it('separates personal posts from joined campaign posts by the existing campaign id', () => {
    const missions = [
      { id: 'personal', campaignId: null },
      { id: 'campaign-a', campaignId: 'campaign-a' },
      { id: 'campaign-b', campaignId: 'campaign-b' },
    ];

    const result = splitServiceMissionsBySource(missions);

    expect(result.personalMissions.map(({ id }) => id)).toEqual(['personal']);
    expect(result.campaignMissions.map(({ id }) => id)).toEqual(['campaign-a', 'campaign-b']);
  });
});
