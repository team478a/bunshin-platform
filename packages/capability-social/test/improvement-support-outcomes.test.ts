import { describe, expect, it } from 'vitest';
import { supportGoalAtOffer } from '../src/improvement-support-outcomes';

describe('support offered-time goal projection', () => {
  it.each(['INQUIRY', 'RECRUIT', 'BRAND_AWARENESS'])(
    'retains %s only from its selection snapshot',
    (goal) => {
      expect(
        supportGoalAtOffer({
          selection: { mode: 'GOAL_SPECIFIC', eligibleGoal: goal, fallbackReason: null },
          currentGoal: 'SALES',
          title: 'free text',
          token: 'secret',
        }),
      ).toEqual({ goalBucket: goal, eligibleGoal: goal, fallbackReason: 'NONE' });
    },
  );
  it.each([null, [], {}, { title: 'legacy' }])(
    'does not invent goals for legacy snapshot %s',
    (value) => {
      expect(supportGoalAtOffer(value)).toEqual({
        goalBucket: 'LEGACY',
        eligibleGoal: 'UNAVAILABLE',
        fallbackReason: 'LEGACY',
      });
    },
  );
  it.each([
    null,
    {},
    { mode: 'UNKNOWN' },
    { mode: 'GOAL_SPECIFIC', eligibleGoal: 'secret', fallbackReason: null },
    { mode: 'COMMON', eligibleGoal: null, fallbackReason: 'secret' },
  ])('keeps malformed selection separate without echoing values %s', (selection) => {
    expect(supportGoalAtOffer({ selection })).toEqual({
      goalBucket: 'INVALID',
      eligibleGoal: 'UNAVAILABLE',
      fallbackReason: 'INVALID',
    });
  });
});
