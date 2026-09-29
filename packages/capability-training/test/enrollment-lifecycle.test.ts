import { describe, expect, it } from 'vitest';
import {
  trainingLifecycleTarget,
  type TrainingEnrollmentStatus,
  type TrainingLifecycleAction,
} from '../src';
describe('training enrollment lifecycle transitions', () => {
  const statuses: TrainingEnrollmentStatus[] = [
    'INVITED',
    'ACTIVE',
    'COMPLETED',
    'CANCELLED',
    'EXPIRED',
  ];
  const actions: TrainingLifecycleAction[] = ['COMPLETE', 'CANCEL', 'REOPEN'];
  for (const status of statuses)
    for (const action of actions)
      it(`${status} / ${action}`, () => {
        const expected =
          status === 'ACTIVE'
            ? action === 'COMPLETE'
              ? 'COMPLETED'
              : action === 'CANCEL'
                ? 'CANCELLED'
                : null
            : status !== 'INVITED' && action === 'REOPEN'
              ? 'ACTIVE'
              : null;
        expect(trainingLifecycleTarget(status, action)).toBe(expected);
      });
});
