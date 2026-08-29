import { describe, expect, it, vi } from 'vitest';
import {
  PrepareBadgeLineNotifications,
  type BadgeLineNotificationPreparationRepository,
} from '../src/badge-line-notification';

describe('badge LINE notification preparation', () => {
  it('prepares a bounded environment-specific batch', async () => {
    const prepare = vi.fn().mockResolvedValue({ scanned: 2, prepared: 1, skipped: 1 });
    const repository: BadgeLineNotificationPreparationRepository = { prepare };
    const result = await new PrepareBadgeLineNotifications(repository).execute({
      environment: 'PRODUCTION',
      limit: 20,
      now: new Date('2026-08-29T00:00:00Z'),
    });
    expect(result).toEqual({ scanned: 2, prepared: 1, skipped: 1 });
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'PRODUCTION', limit: 20 }),
    );
  });

  it('rejects an unbounded batch', async () => {
    await expect(
      new PrepareBadgeLineNotifications({ prepare: vi.fn() }).execute({
        environment: 'PRODUCTION',
        limit: 101,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
