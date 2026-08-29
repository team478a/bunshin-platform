import { describe, expect, it, vi } from 'vitest';
import {
  ExecuteBadgeLineDelivery,
  type BadgeLineDeliveryRepository,
  type LineMessagingProviderPort,
} from '../src';

function setup(overrides: { allowed?: boolean; attemptCount?: number } = {}) {
  const repository = {
    claim: vi.fn().mockResolvedValue({
      id: 'delivery-1',
      environment: 'PRODUCTION',
      workspaceId: 'workspace-1',
      groupId: 'group-1',
      userId: 'user-1',
      title: 'はじめの一歩',
      description: '初めての行動を達成しました。',
      attemptCount: overrides.attemptCount ?? 1,
    }),
    finish: vi.fn().mockResolvedValue(true),
    isAllowed: vi.fn().mockResolvedValue(overrides.allowed ?? true),
  } satisfies BadgeLineDeliveryRepository;
  const provider = {
    getQuota: vi.fn().mockResolvedValue({ ok: true, limit: 1_000, consumption: 10 }),
    pushMissionNotification: vi.fn(),
    pushBadgeNotification: vi.fn().mockResolvedValue({ ok: true }),
  } satisfies LineMessagingProviderPort;
  const execute = new ExecuteBadgeLineDelivery(
    repository,
    {
      getActive: vi.fn().mockResolvedValue({
        environment: 'PRODUCTION',
        accessToken: 'secret',
        globallyPaused: false,
        quotaWarningPercent: 80,
        quotaLowPriorityStop: 90,
      }),
    },
    { resolve: vi.fn().mockResolvedValue('line-user-1') },
    provider,
    () => new Date('2026-08-29T13:00:00.000Z'),
  );
  return { execute, repository, provider };
}

describe('ExecuteBadgeLineDelivery', () => {
  it('rechecks gates and sends one safe badge notification', async () => {
    const values = setup();
    await expect(
      values.execute.execute({
        deliveryId: 'delivery-1',
        environment: 'PRODUCTION',
        workerId: 'worker-1',
        badgeUrl: 'https://watashi-works.example/badges',
      }),
    ).resolves.toEqual({ status: 'SENT', warning: false });
    expect(values.provider.pushBadgeNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'line-user-1', title: 'はじめの一歩' }),
    );
    expect(values.repository.finish).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SENT', errorCategory: null }),
    );
  });

  it('cancels without provider access when consent is no longer valid', async () => {
    const values = setup({ allowed: false });
    await expect(
      values.execute.execute({
        deliveryId: 'delivery-1',
        environment: 'PRODUCTION',
        workerId: 'worker-1',
        badgeUrl: 'https://watashi-works.example/badges',
      }),
    ).resolves.toMatchObject({ status: 'CANCELLED', category: 'NOTIFICATION_SUPPRESSED' });
    expect(values.provider.getQuota).not.toHaveBeenCalled();
  });

  it('moves the last retryable provider failure to DEAD', async () => {
    const values = setup({ attemptCount: 3 });
    values.provider.pushBadgeNotification.mockResolvedValue({
      ok: false,
      category: 'TIMEOUT',
      retryable: true,
    });
    await expect(
      values.execute.execute({
        deliveryId: 'delivery-1',
        environment: 'PRODUCTION',
        workerId: 'worker-1',
        badgeUrl: 'https://watashi-works.example/badges',
      }),
    ).resolves.toEqual({ status: 'DEAD', category: 'TIMEOUT', retryable: false });
  });
});
