import { describe, expect, it } from 'vitest';
import { socialActivityBarrierNotificationKey } from '../src/services/social-activity-barrier-line-scheduler';

describe('social activity barrier LINE notification key', () => {
  it('is deterministic across case ordering and changes when a case recurs', () => {
    const first = socialActivityBarrierNotificationKey('PRODUCTION', 'member-1', 'bunshin-1', [
      { id: 'case-b', recurrenceCount: 1 },
      { id: 'case-a', recurrenceCount: 1 },
    ]);
    const reordered = socialActivityBarrierNotificationKey('PRODUCTION', 'member-1', 'bunshin-1', [
      { id: 'case-a', recurrenceCount: 1 },
      { id: 'case-b', recurrenceCount: 1 },
    ]);
    const recurrence = socialActivityBarrierNotificationKey('PRODUCTION', 'member-1', 'bunshin-1', [
      { id: 'case-a', recurrenceCount: 2 },
      { id: 'case-b', recurrenceCount: 1 },
    ]);
    expect(first).toBe(reordered);
    expect(recurrence).not.toBe(first);
    expect(first.length).toBeLessThanOrEqual(200);
  });
});
