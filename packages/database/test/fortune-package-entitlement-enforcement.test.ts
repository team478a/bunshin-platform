import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaServiceFoundationRepository } from '../src';

const configuration = {
  slug: 'daily-fortune',
  displayName: '毎日の占い',
  description: '毎日のカードを確認します。',
  operatorName: '運営事務局',
  contactEmail: null,
  visibility: 'PRIVATE' as const,
  poweredByEnabled: true,
  startsAt: null,
  endsAt: null,
  termsUrl: null,
  privacyUrl: null,
  brand: {
    logoUrl: null,
    iconUrl: null,
    faviconUrl: null,
    primaryColor: '#0B356A',
    secondaryColor: '#FF3B30',
    fontFamily: 'system-ui',
  },
  registration: {
    mode: 'PUBLIC' as const,
    emailEnabled: false,
    lineEnabled: true,
    inviteCodeEnabled: false,
    referralEnabled: false,
    onboardingConfig: {},
    surveyConfig: {},
  },
};

describe('fortune package entitlement enforcement', () => {
  it('stops before creating a group when the organization has no package license', async () => {
    const groupCreate = vi.fn();
    const tx = {
      platformAdmin: { findFirst: vi.fn().mockResolvedValue({ id: 'admin-1' }) },
      workspace: { findFirst: vi.fn().mockResolvedValue({ id: 'workspace-1' }) },
      organizationEntitlement: {
        findUnique: vi.fn().mockResolvedValue({
          maxGroups: null,
          maxServices: null,
          oemEnabled: false,
          fortunePackageEnabled: false,
          suspended: false,
          startsAt: null,
          endsAt: null,
        }),
      },
      group: { count: vi.fn(), create: groupCreate },
      serviceConfiguration: { count: vi.fn() },
    };
    const client = {
      $transaction: vi.fn((operation: (value: typeof tx) => unknown) => operation(tx)),
    } as unknown as PrismaClient;

    await expect(
      new PrismaServiceFoundationRepository(client).create({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        reason: '占いサービスを契約した団体へ作成する',
        requiredFeature: 'FORTUNE_PACKAGE',
        configuration,
      }),
    ).resolves.toBeNull();
    expect(groupCreate).not.toHaveBeenCalled();
  });
});
