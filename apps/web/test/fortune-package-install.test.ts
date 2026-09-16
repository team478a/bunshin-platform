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
          fortunePackage: { key: 'FORTUNE_DAILY_GUIDANCE', version: 2 },
        },
      },
    },
  },
  tx: {
    organizationEntitlement: { findUnique: vi.fn() },
    serviceConfiguration: { findFirst: vi.fn() },
    serviceRegistrationPolicy: { update: vi.fn() },
    serviceCommercialSetting: { upsert: vi.fn() },
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

import {
  installStandardFortunePackage,
  updateStandardFortunePackage,
} from '../src/fortune/operator';

describe('fortune package installation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.service.configuration.registration.onboardingConfig = {
      fortunePackage: { key: 'FORTUNE_DAILY_GUIDANCE', version: 2 },
    };
    state.tx.serviceConfiguration.findFirst.mockResolvedValue({
      id: state.service.configuration.id,
      registration: {
        onboardingConfig: state.service.configuration.registration.onboardingConfig,
      },
      fortuneSetting: null,
    });
    state.tx.organizationEntitlement.findUnique.mockResolvedValue({
      fortunePackageEnabled: true,
      suspended: false,
      startsAt: null,
      endsAt: null,
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
    expect(state.tx.serviceCommercialSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          billingMode: 'FREE',
          status: 'ACTIVE',
          includedMemberLimit: 100,
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
    expect(state.tx.serviceRegistrationPolicy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          onboardingConfig: expect.objectContaining({
            fortunePackage: expect.objectContaining({ version: 2 }),
          }),
        },
      }),
    );
  });

  it('does not create duplicates when the package is already installed', async () => {
    state.tx.serviceConfiguration.findFirst.mockResolvedValue({
      id: state.service.configuration.id,
      registration: {
        onboardingConfig: state.service.configuration.registration.onboardingConfig,
      },
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
    expect(state.tx.serviceCommercialSetting.upsert).toHaveBeenCalledTimes(1);
    expect(state.tx.organizationEntitlement.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a new installation when the organization has no active package license', async () => {
    state.tx.organizationEntitlement.findUnique.mockResolvedValue({
      fortunePackageEnabled: false,
      suspended: false,
      startsAt: null,
      endsAt: null,
    });

    await expect(
      installStandardFortunePackage({
        serviceSlug: 'daily-fortune',
        actorUserId: '77777777-7777-4777-8777-777777777777',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(state.tx.serviceCommercialSetting.upsert).not.toHaveBeenCalled();
    expect(state.tx.bunshin.create).not.toHaveBeenCalled();
  });

  it('updates an installed v1 package without replacing operator settings or custom metadata', async () => {
    const legacyConfig = {
      welcomeTitle: '独自の案内',
      fortunePackage: {
        key: 'FORTUNE_DAILY_GUIDANCE',
        version: 1,
        customLabel: '保持する',
      },
    };
    state.service.configuration.registration.onboardingConfig = legacyConfig;
    state.tx.serviceConfiguration.findFirst.mockResolvedValue({
      id: state.service.configuration.id,
      registration: {
        onboardingConfig: state.service.configuration.registration.onboardingConfig,
      },
      fortuneSetting: { id: '55555555-5555-4555-8555-555555555555' },
    });

    await expect(
      updateStandardFortunePackage({
        serviceSlug: 'daily-fortune',
        actorUserId: '77777777-7777-4777-8777-777777777777',
      }),
    ).resolves.toEqual({ updated: true, fromVersion: 1, toVersion: 2 });
    expect(state.tx.serviceRegistrationPolicy.update).toHaveBeenCalledWith({
      where: { configurationId: state.service.configuration.id },
      data: {
        onboardingConfig: {
          welcomeTitle: '独自の案内',
          fortunePackage: {
            key: 'FORTUNE_DAILY_GUIDANCE',
            version: 2,
            customLabel: '保持する',
          },
        },
      },
    });
    expect(state.tx.serviceCommercialSetting.upsert).toHaveBeenCalledTimes(1);
  });

  it('does not rewrite a package that is already current', async () => {
    await expect(
      updateStandardFortunePackage({
        serviceSlug: 'daily-fortune',
        actorUserId: '77777777-7777-4777-8777-777777777777',
      }),
    ).resolves.toEqual({ updated: false, fromVersion: 2, toVersion: 2 });
    expect(state.tx.serviceRegistrationPolicy.update).not.toHaveBeenCalled();
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
