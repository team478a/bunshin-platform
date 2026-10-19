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
      recentProviderFailures: 0,
      recentUnknownCostEvents: 0,
      staleOpenAdmissions: 0,
    },
  ],
  line: {
    required: true,
    active: true,
    verified: true,
    globallyPaused: false,
    failedDeliveries: 0,
    retryScheduledJobs: 0,
    deadJobs: 0,
  },
  serviceLineBroadcasts: [],
  otherDeadJobs: 0,
  rewards: {
    failedPointProcessing: 0,
    stalePointProcessing: 0,
    failedBadgeProcessing: 0,
    staleBadgeProcessing: 0,
    stoppedServices: 0,
  },
  blockedDeletions: 0,
  personalLearningStaleOpenAdmissions: 0,
  openSupportCases: 0,
  urgentSupportCases: 0,
  commercialBillingRefundReviews: 0,
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

  it('reports provider failures separately from unknown-cost telemetry', () => {
    const snapshot = healthy();
    snapshot.ai[0]!.recentProviderFailures = 3;
    snapshot.ai[0]!.recentUnknownCostEvents = 5;

    expect(buildAdminAlerts(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'AI_OPENAI_FAILURES',
          severity: 'WARNING',
          count: 3,
          title: expect.stringContaining('通信・応答処理'),
        }),
        expect.objectContaining({
          code: 'AI_OPENAI_UNKNOWN_COST',
          severity: 'WARNING',
          count: 5,
          title: expect.stringContaining('利用料を算定できない'),
        }),
      ]),
    );
  });

  it('keeps stale open cost reservations visible for explicit recovery', () => {
    const snapshot = healthy();
    snapshot.ai[0]!.staleOpenAdmissions = 2;
    expect(buildAdminAlerts(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'AI_OPENAI_OPEN_ADMISSIONS',
          severity: 'WARNING',
          count: 2,
          href: '/admin/ai',
        }),
      ]),
    );
  });

  it('shows stale Personal Learning reservations in the operations center', () => {
    const snapshot = healthy();
    snapshot.personalLearningStaleOpenAdmissions = 3;
    expect(buildAdminAlerts(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'AI_PERSONAL_LEARNING_OPEN_ADMISSIONS',
          severity: 'WARNING',
          count: 3,
          href: '/admin/ai',
        }),
      ]),
    );
  });

  it('does not require the shared LINE configuration when no delivery uses it', () => {
    const snapshot = healthy();
    snapshot.line = {
      ...snapshot.line,
      required: false,
      active: false,
      verified: false,
      globallyPaused: true,
    };

    expect(buildAdminAlerts(snapshot).map((item) => item.code)).not.toEqual(
      expect.arrayContaining(['LINE_CONFIGURATION_UNAVAILABLE', 'LINE_GLOBALLY_PAUSED']),
    );
  });

  it('reports reward processing failures and intentional service stops separately', () => {
    const snapshot = healthy();
    snapshot.rewards = {
      failedPointProcessing: 2,
      stalePointProcessing: 1,
      failedBadgeProcessing: 3,
      staleBadgeProcessing: 0,
      stoppedServices: 2,
    };

    expect(buildAdminAlerts(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'REWARDS_PROCESSING_FAILURES',
          severity: 'WARNING',
          count: 6,
          href: '/admin/rewards',
        }),
        expect.objectContaining({
          code: 'POINT_ISSUANCE_STOPPED_SERVICES',
          severity: 'INFO',
          count: 2,
          href: '/admin/rewards',
        }),
      ]),
    );
  });

  it('shows OEM invoice refund reviews without treating them as settled', () => {
    const snapshot = healthy();
    snapshot.commercialBillingRefundReviews = 2;

    expect(buildAdminAlerts(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'COMMERCIAL_BILLING_REFUND_REVIEWS',
          severity: 'WARNING',
          count: 2,
          title: expect.stringContaining('返金の要照合'),
          guidance: expect.stringContaining('内部請求状態は自動変更されていません'),
          href: '/admin/commercial-billing?status=REFUND_REVIEW',
        }),
      ]),
    );
  });

  it('groups service broadcast incidents by service and links to its LINE operations page', () => {
    const snapshot = healthy();
    snapshot.serviceLineBroadcasts = [
      {
        code: 'SERVICE_BROADCAST_HIGH_FAILURE',
        serviceSlug: 'service-a',
        serviceDisplayName: 'サービスA',
      },
      {
        code: 'SERVICE_BROADCAST_HIGH_FAILURE',
        serviceSlug: 'service-a',
        serviceDisplayName: 'サービスA',
      },
      {
        code: 'SERVICE_BROADCAST_RECOVERED',
        serviceSlug: 'service-b',
        serviceDisplayName: 'サービスB',
      },
    ];

    expect(buildAdminAlerts(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'CRITICAL',
          title: expect.stringContaining('サービスA'),
          count: 2,
          href: '/s/service-a/manage/line',
        }),
        expect.objectContaining({
          severity: 'INFO',
          title: expect.stringContaining('サービスB'),
          count: 1,
          href: '/s/service-b/manage/line',
        }),
      ]),
    );
  });

  it('surfaces monthly personal-learning LINE quota warnings without learner data', () => {
    const snapshot = healthy();
    snapshot.personalLearningLineQuotaNotices = [
      { thresholdPercent: 80 },
      { thresholdPercent: 80 },
      { thresholdPercent: 90 },
    ];

    expect(buildAdminAlerts(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PERSONAL_LEARNING_LINE_QUOTA_80',
          severity: 'WARNING',
          count: 2,
          href: '/admin/line',
        }),
        expect.objectContaining({
          code: 'PERSONAL_LEARNING_LINE_QUOTA_90',
          severity: 'CRITICAL',
          count: 1,
          href: '/admin/line',
        }),
      ]),
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
