import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  service: {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    serviceId: '22222222-2222-4222-8222-222222222222',
    configuration: {
      id: '33333333-3333-4333-8333-333333333333',
      registration: {
        onboardingConfig: {
          fortunePackage: { key: 'FORTUNE_DAILY_GUIDANCE', version: 1 },
        },
      },
    },
  },
  tx: {
    serviceConfiguration: { findFirst: vi.fn() },
    bunshin: { create: vi.fn() },
    bunshinCapabilityAssignment: { create: vi.fn() },
    fortuneServiceSetting: { create: vi.fn() },
    fortuneKnowledgeVersion: { create: vi.fn(), update: vi.fn() },
    fortuneCardMeaning: {
      createMany:
        vi.fn<(input: { data: Array<{ safetyReviewed: boolean }> }) => Promise<unknown>>(),
    },
  },
}));

vi.mock('../src/services/public-service', () => ({
  resolveManagedServiceContext: vi.fn(() => Promise.resolve(state.service)),
}));

vi.mock('@bunshin/database', () => ({
  prisma: {
    $transaction: vi.fn((operation: (tx: typeof state.tx) => unknown) => operation(state.tx)),
  },
}));

import { installStandardFortunePackage } from '../src/fortune/operator';

describe('fortune package installation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.service.configuration.registration.onboardingConfig = {
      fortunePackage: { key: 'FORTUNE_DAILY_GUIDANCE', version: 1 },
    };
    state.tx.serviceConfiguration.findFirst.mockResolvedValue({
      id: state.service.configuration.id,
      fortuneSetting: null,
    });
    state.tx.bunshin.create.mockResolvedValue({ id: '44444444-4444-4444-8444-444444444444' });
    state.tx.fortuneServiceSetting.create.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
    });
    state.tx.fortuneKnowledgeVersion.create.mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
    });
  });

  it('installs a private standard package and all 468 reviewed meanings in one transaction', async () => {
    const result = await installStandardFortunePackage({
      serviceSlug: 'daily-fortune',
      actorUserId: '77777777-7777-4777-8777-777777777777',
    });

    expect(result).toMatchObject({ installed: true, version: 1, meaningCount: 468 });
    expect(state.tx.bunshin.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE', type: 'EXPERT' }),
      }),
    );
    expect(state.tx.fortuneServiceSetting.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enabled: false,
          aiEnabled: false,
          minimumAge: 18,
          historyRetentionDays: 90,
          weeklyNotificationEnabled: false,
        }),
      }),
    );
    const meanings = state.tx.fortuneCardMeaning.createMany.mock.calls[0]?.[0].data;
    expect(meanings).toBeDefined();
    if (!meanings) throw new Error('fortune meanings were not created');
    expect(meanings).toHaveLength(468);
    expect(meanings.every((meaning: { safetyReviewed: boolean }) => meaning.safetyReviewed)).toBe(
      true,
    );
  });

  it('does not create duplicates when the package is already installed', async () => {
    state.tx.serviceConfiguration.findFirst.mockResolvedValue({
      id: state.service.configuration.id,
      fortuneSetting: {
        bunshinId: '44444444-4444-4444-8444-444444444444',
        knowledgeVersions: [{ version: 1, _count: { cardMeanings: 468 } }],
      },
    });

    await expect(
      installStandardFortunePackage({
        serviceSlug: 'daily-fortune',
        actorUserId: '77777777-7777-4777-8777-777777777777',
      }),
    ).resolves.toEqual({
      installed: false,
      bunshinId: '44444444-4444-4444-8444-444444444444',
      version: 1,
      meaningCount: 468,
    });
    expect(state.tx.bunshin.create).not.toHaveBeenCalled();
    expect(state.tx.fortuneServiceSetting.create).not.toHaveBeenCalled();
  });

  it('refuses installation when the service was not created from the fortune package', async () => {
    state.service.configuration.registration.onboardingConfig = {
      fortunePackage: { key: 'OTHER_PACKAGE', version: 1 },
    };
    await expect(
      installStandardFortunePackage({
        serviceSlug: 'ordinary-service',
        actorUserId: '77777777-7777-4777-8777-777777777777',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(state.tx.serviceConfiguration.findFirst).not.toHaveBeenCalled();
  });
});
