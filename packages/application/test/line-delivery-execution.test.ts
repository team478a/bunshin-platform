import { describe, expect, it, vi } from 'vitest';
import {
  ExecuteLineMissionDelivery,
  evaluateLineQuota,
  type LineDeliveryConfigurationPort,
  type LineMessageDelivery,
  type LineMessageDeliveryRepository,
  type LineMessagingProviderPort,
  type LineMissionNotificationSummaryRepository,
  type LineRecipientResolverPort,
} from '../src';

const now = new Date('2026-08-22T05:00:00Z');

function delivery(overrides: Partial<LineMessageDelivery> = {}): LineMessageDelivery {
  return {
    id: 'delivery-a',
    environment: 'PRODUCTION',
    workspaceId: 'workspace-a',
    bunshinId: 'bunshin-a',
    userId: 'user-a',
    dailyMissionId: 'mission-a',
    kind: 'DAILY_MISSION',
    status: 'PROCESSING',
    idempotencyKey: 'mission-a:daily',
    scheduledAt: now,
    sentAt: null,
    cancelledAt: null,
    lastErrorCategory: null,
    attemptCount: 1,
    leaseOwner: 'worker-a',
    leaseExpiresAt: new Date(now.getTime() + 30_000),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function dependencies(input?: {
  claimed?: boolean;
  kind?: 'DAILY_MISSION' | 'REMINDER';
  paused?: boolean;
  quota?: { limit: number | null; consumption: number };
  pushFailure?: { category: 'RATE_LIMITED'; retryable: true };
}) {
  const current = delivery({ kind: input?.kind ?? 'DAILY_MISSION' });
  const repository = {
    getScoped: vi.fn(),
    prepare: vi.fn(),
    claim: vi
      .fn()
      .mockResolvedValue(input?.claimed === false ? null : { delivery: current, attemptNumber: 1 }),
    recordAttempt: vi.fn().mockResolvedValue(undefined),
    releaseClaim: vi.fn().mockResolvedValue(true),
  } satisfies LineMessageDeliveryRepository;
  const configuration = {
    getActive: vi.fn().mockResolvedValue({
      environment: 'PRODUCTION',
      accessToken: 'sealed-outside-application',
      globallyPaused: input?.paused ?? false,
      quotaWarningPercent: 80,
      quotaLowPriorityStop: 90,
    }),
  } satisfies LineDeliveryConfigurationPort;
  const recipient = {
    resolve: vi.fn().mockResolvedValue('provider-user-a'),
  } satisfies LineRecipientResolverPort;
  const summary = {
    resolve: vi.fn().mockResolvedValue({
      platform: 'INSTAGRAM',
      format: 'SLIDE',
      estimatedMinutes: 5,
      topic: '朝の時間を上手に使うコツ',
    }),
  } satisfies LineMissionNotificationSummaryRepository;
  const provider = {
    getQuota: vi
      .fn()
      .mockResolvedValue({ ok: true, ...(input?.quota ?? { limit: 100, consumption: 10 }) }),
    pushMissionNotification: vi
      .fn()
      .mockResolvedValue(input?.pushFailure ? { ok: false, ...input.pushFailure } : { ok: true }),
  } satisfies LineMessagingProviderPort;
  return { repository, configuration, recipient, summary, provider };
}

async function execute(
  values: ReturnType<typeof dependencies>,
  deepLinkUrl: string | (() => Promise<string>) = 'https://app.example.com/today?state=opaque',
) {
  return new ExecuteLineMissionDelivery(
    values.repository,
    values.configuration,
    values.recipient,
    values.summary,
    values.provider,
    () => now,
  ).execute({
    deliveryId: 'delivery-a',
    environment: 'PRODUCTION',
    actorUserId: 'user-a',
    workerId: 'worker-a',
    deepLinkUrl,
  });
}

describe('LINE delivery execution', () => {
  it('sends once under a lease and records a successful provider attempt', async () => {
    const values = dependencies({ quota: { limit: 100, consumption: 80 } });
    await expect(execute(values)).resolves.toEqual({ status: 'SENT', warning: true });
    expect(values.provider.pushMissionNotification).toHaveBeenCalledWith({
      accessToken: 'sealed-outside-application',
      recipientId: 'provider-user-a',
      deepLinkUrl: 'https://app.example.com/today?state=opaque',
      summary: {
        platform: 'INSTAGRAM',
        format: 'SLIDE',
        estimatedMinutes: 5,
        topic: '朝の時間を上手に使うコツ',
      },
    });
    expect(values.repository.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'PRODUCTION',
        leaseOwner: 'worker-a',
        attemptNumber: 1,
        status: 'SUCCESS',
        errorCategory: null,
      }),
    );
  });

  it('does not call LINE when another worker holds the delivery', async () => {
    const values = dependencies({ claimed: false });
    await expect(execute(values)).resolves.toEqual({
      status: 'BUSY',
      category: null,
      retryable: true,
    });
    expect(values.configuration.getActive).not.toHaveBeenCalled();
    expect(values.provider.getQuota).not.toHaveBeenCalled();
  });

  it('fails closed during a global pause before resolving a recipient', async () => {
    const values = dependencies({ paused: true });
    const issueDeepLink = vi.fn().mockResolvedValue('https://app.example.com/today?state=opaque');
    await expect(execute(values, issueDeepLink)).resolves.toEqual({
      status: 'CANCELLED',
      category: 'GLOBALLY_PAUSED',
      retryable: false,
    });
    expect(values.recipient.resolve).not.toHaveBeenCalled();
    expect(values.provider.getQuota).not.toHaveBeenCalled();
    expect(issueDeepLink).not.toHaveBeenCalled();
  });

  it('issues a short-lived deep link only after configuration, recipient and quota checks pass', async () => {
    const values = dependencies();
    const issueDeepLink = vi.fn().mockResolvedValue('https://app.example.com/today?state=opaque');
    await expect(execute(values, issueDeepLink)).resolves.toMatchObject({ status: 'SENT' });
    expect(issueDeepLink).toHaveBeenCalledOnce();
    expect(values.provider.pushMissionNotification).toHaveBeenCalledWith(
      expect.objectContaining({ deepLinkUrl: 'https://app.example.com/today?state=opaque' }),
    );
  });

  it('resolves only the scoped safe Mission projection and never accepts Mission content', async () => {
    const values = dependencies();
    await execute(values);
    expect(values.summary.resolve).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      bunshinId: 'bunshin-a',
      actorUserId: 'user-a',
      dailyMissionId: 'mission-a',
    });
    const providerInput = values.provider.pushMissionNotification.mock.calls[0]?.[0];
    expect(providerInput).not.toHaveProperty('content');
    expect(providerInput).not.toHaveProperty('knowledge');
    expect(providerInput).not.toHaveProperty('memory');
  });

  it('fails closed when the scoped Mission summary is unavailable', async () => {
    const values = dependencies();
    values.summary.resolve.mockResolvedValue(null);
    await expect(execute(values)).resolves.toEqual({
      status: 'FAILED',
      category: 'MISSION_UNAVAILABLE',
      retryable: false,
    });
    expect(values.provider.pushMissionNotification).not.toHaveBeenCalled();
  });

  it('stops low-priority reminders at the configured quota threshold', async () => {
    const values = dependencies({
      kind: 'REMINDER',
      quota: { limit: 100, consumption: 90 },
    });
    await expect(execute(values)).resolves.toEqual({
      status: 'CANCELLED',
      category: 'QUOTA_LOW_PRIORITY_STOP',
      retryable: false,
    });
    expect(values.provider.pushMissionNotification).not.toHaveBeenCalled();
  });

  it('records classified retryable provider failures without exposing provider data', async () => {
    const values = dependencies({
      pushFailure: { category: 'RATE_LIMITED', retryable: true },
    });
    await expect(execute(values)).resolves.toEqual({
      status: 'FAILED',
      category: 'RATE_LIMITED',
      retryable: true,
    });
    expect(values.repository.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', errorCategory: 'RATE_LIMITED' }),
    );
  });

  it('rejects non-HTTPS production deep links before claiming', async () => {
    const values = dependencies();
    await expect(execute(values, 'http://app.example.com/today')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(values.repository.claim).not.toHaveBeenCalled();
  });
});

describe('LINE quota policy', () => {
  it('keeps the primary Daily Mission until the absolute limit', () => {
    expect(
      evaluateLineQuota({
        kind: 'DAILY_MISSION',
        limit: 100,
        consumption: 95,
        warningPercent: 80,
        lowPriorityStopPercent: 90,
      }),
    ).toEqual({ allowed: true, warning: true, category: null });
  });

  it('stops every message at the absolute limit', () => {
    expect(
      evaluateLineQuota({
        kind: 'DAILY_MISSION',
        limit: 100,
        consumption: 100,
        warningPercent: 80,
        lowPriorityStopPercent: 90,
      }),
    ).toEqual({ allowed: false, warning: true, category: 'QUOTA_EXHAUSTED' });
  });
});
