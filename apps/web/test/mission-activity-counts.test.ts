import { describe, expect, it } from 'vitest';
import { uniqueMissionCount } from '../src/services/mission-activity-counts';

describe('unique mission activity counts', () => {
  it('counts a post once even when its five image pages were copied separately', () => {
    expect(
      uniqueMissionCount([
        { dailyMissionId: 'post-a' },
        { dailyMissionId: 'post-a' },
        { dailyMissionId: 'post-a' },
        { dailyMissionId: 'post-a' },
        { dailyMissionId: 'post-a' },
        { dailyMissionId: 'post-b' },
      ]),
    ).toBe(2);
  });
});
