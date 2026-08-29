import { describe, expect, it } from 'vitest';
import { InspectBadgeLineReconciliation } from '../src';

describe('InspectBadgeLineReconciliation', () => {
  it('returns the environment-scoped read-only snapshot', async () => {
    const checkedAt = new Date('2026-08-29T00:00:00.000Z');
    const snapshot = {
      environment: 'PRODUCTION' as const,
      checkedAt,
      missingDeliveries: 0,
      pendingWithoutJob: 0,
      deadDeliveries: 0,
      pendingWhileGloballyPaused: 0,
      pendingInDisabledGroups: 0,
      healthy: true,
    };
    const inspect = new InspectBadgeLineReconciliation({
      inspect: (input) => Promise.resolve({ ...snapshot, checkedAt: input.now }),
    });
    await expect(
      inspect.execute({ actorUserId: 'admin-1', environment: 'PRODUCTION', now: checkedAt }),
    ).resolves.toEqual(snapshot);
  });

  it('does not expose the snapshot to an unauthorized actor', async () => {
    const inspect = new InspectBadgeLineReconciliation({ inspect: () => Promise.resolve(null) });
    await expect(
      inspect.execute({ actorUserId: 'user-1', environment: 'PRODUCTION' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
