import { describe, expect, it } from 'vitest';
import { summarizeAssistanceLevels } from '../src';

describe('assistance level metrics', () => {
  it('deduplicates repeated activities and keeps zero denominators unknown', () => {
    const level = { assistanceLevel: 'READY_TO_USE' as const };
    const values = summarizeAssistanceLevels({
      missions: [{ id: 'mission-1', ...level }],
      activities: [
        { dailyMissionId: 'mission-1', type: 'VIEWED', dailyMission: level },
        { dailyMissionId: 'mission-1', type: 'VIEWED', dailyMission: level },
        { dailyMissionId: 'mission-1', type: 'ACCEPTED', dailyMission: level },
        {
          dailyMissionId: 'mission-1',
          type: 'COPIED_IMAGE_INSTRUCTION',
          dailyMission: level,
        },
      ],
      posts: [{ dailyMissionId: 'mission-1', dailyMission: level }],
      feedback: [{ dailyMissionId: 'mission-1', rating: 'GOOD', dailyMission: level }],
    });
    expect(values.find(({ level }) => level === 'READY_TO_USE')).toEqual({
      level: 'READY_TO_USE',
      missions: 1,
      viewed: 1,
      accepted: 1,
      copied: 1,
      posted: 1,
      feedback: 1,
      goodFeedback: 1,
      acceptanceRate: 1,
      copyRate: 1,
      postRate: 1,
      goodFeedbackRate: 1,
    });
    expect(values.find(({ level }) => level === 'IDEA_ONLY')?.acceptanceRate).toBeNull();
  });
});
