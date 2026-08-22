import { describe, expect, it, vi } from 'vitest';
import { GetLineAdminMetrics, type LineAdminMetricsRepository } from '../src';

describe('LINE admin observability', () => {
  it('returns only the environment-scoped aggregate supplied by the repository', async () => {
    const value = {
      environment: 'STAGING' as const,
      connections: { active: 2, following: 1, notificationReady: 1 },
      deliveries: { pending: 1, processing: 0, sent: 3, failed: 1, cancelled: 0 },
      jobs: { retryScheduled: 1, dead: 0 },
      failures: [{ category: 'RATE_LIMITED', count: 1 }],
      configuration: {
        active: true,
        verified: true,
        globallyPaused: false,
        quotaWarningPercent: 80,
        quotaLowPriorityStop: 90,
      },
    };
    const repository = {
      get: vi.fn().mockResolvedValue(value),
    } satisfies LineAdminMetricsRepository;
    await expect(
      new GetLineAdminMetrics(repository).execute('admin-a', 'STAGING'),
    ).resolves.toEqual(value);
    expect(repository.get).toHaveBeenCalledWith('admin-a', 'STAGING');
  });

  it('hides the administration boundary from unauthorized actors', async () => {
    const repository = {
      get: vi.fn().mockResolvedValue(null),
    } satisfies LineAdminMetricsRepository;
    await expect(
      new GetLineAdminMetrics(repository).execute('user-a', 'PRODUCTION'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
