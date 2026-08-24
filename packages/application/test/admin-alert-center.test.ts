import { describe, expect, it, vi } from 'vitest';
import {
  buildAdminAlerts,
  GetAdminAlerts,
  type AdminAlertRepository,
  type AdminAlertSnapshot,
} from '../src';

const healthy = (): AdminAlertSnapshot => ({
  ai: [
    {
      provider: 'OPENAI',
      globallyPaused: false,
      lastErrorCategory: null,
      dailyBudgetUsdMicros: 1_000_000,
      monthlyBudgetUsdMicros: 10_000_000,
      dailySpentUsdMicros: 100_000,
      monthlySpentUsdMicros: 100_000,
      recentFailures: 0,
    },
  ],
  line: {
    active: true,
    verified: true,
    globallyPaused: false,
    failedDeliveries: 0,
    retryScheduledJobs: 0,
    deadJobs: 0,
  },
  otherDeadJobs: 0,
  blockedDeletions: 0,
  openSupportCases: 0,
  urgentSupportCases: 0,
});

describe('admin alert center', () => {
  it('shows no alerts for a healthy runtime', () => {
    expect(buildAdminAlerts(healthy())).toEqual([]);
  });

  it('raises budget and delivery failures with critical items first', () => {
    const snapshot = healthy();
    snapshot.ai[0]!.dailySpentUsdMicros = 1_000_000;
    snapshot.line.failedDeliveries = 2;
    snapshot.openSupportCases = 3;
    const alerts = buildAdminAlerts(snapshot);
    expect(alerts[0]).toMatchObject({ severity: 'CRITICAL' });
    expect(alerts.map((item) => item.code)).toEqual(
      expect.arrayContaining(['AI_OPENAI_BUDGET', 'LINE_DELIVERY_FAILURES', 'OPEN_SUPPORT_CASES']),
    );
  });

  it('does not expose the center when the repository rejects the administrator', async () => {
    const repository: AdminAlertRepository = { snapshot: vi.fn().mockResolvedValue(null) };
    await expect(
      new GetAdminAlerts(repository).execute({
        actorUserId: crypto.randomUUID(),
        environment: 'PRODUCTION',
        now: new Date('2026-08-25T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
