import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  membership: vi.fn(),
  policy: vi.fn(),
  partners: vi.fn(),
  configuration: vi.fn(),
  connection: vi.fn(),
  legalConsentView: vi.fn(),
  programs: vi.fn(),
}));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: mocks.context }));
vi.mock('../src/line/secure-configuration', () => ({ currentLineEnvironment: () => 'PRODUCTION' }));
vi.mock('@bunshin/database', () => ({
  PrismaServiceParticipationRepository: class {
    findLegalConsentView = mocks.legalConsentView;
  },
  prisma: {
    groupMembership: { findFirst: mocks.membership },
    groupLineRoutingPolicy: { findUnique: mocks.policy },
    bunshin: { findMany: mocks.partners },
    groupLineChannelConfiguration: { findFirst: mocks.configuration },
    groupLineConnection: { findFirst: mocks.connection },
    serviceProgram: { findMany: mocks.programs },
  },
}));
import { loadServiceLineSettings } from '../src/services/service-line-settings';

describe('participant LINE settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.mockResolvedValue({
      workspaceId: 'workspace-a',
      serviceId: 'service-a',
      configuration: { slug: 'service-a' },
    });
    mocks.membership.mockResolvedValue({ id: 'membership-a', consentedAt: new Date() });
    mocks.policy.mockResolvedValue({ mode: 'DEDICATED', pilotEnabled: true });
    mocks.partners.mockResolvedValue([{ id: 'partner-a', name: '相棒' }]);
    mocks.programs.mockResolvedValue([]);
    mocks.configuration.mockResolvedValue({
      id: 'config-a',
      lastVerifiedAt: new Date(),
      lastErrorCategory: null,
      globallyPaused: false,
    });
    mocks.connection.mockResolvedValue({
      status: 'ACTIVE',
      friendshipStatus: 'FOLLOWING',
      notificationConsentAt: new Date(),
    });
    mocks.legalConsentView.mockResolvedValue({
      legalDocuments: [{ id: 'terms-v2' }],
      acceptedDocumentIds: ['terms-v2'],
    });
  });

  it('scopes partners and connection to the actor, membership, service, configuration and environment', async () => {
    const result = await loadServiceLineSettings('service-a', 'user-a');
    expect(result).toMatchObject({ available: true, connected: true });
    expect(mocks.context).toHaveBeenCalledWith('service-a', 'user-a');
    expect(mocks.partners).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-a',
          groupId: 'service-a',
          ownerUserId: 'user-a',
          status: { not: 'ARCHIVED' },
        },
      }),
    );
    expect(mocks.configuration).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-a',
          groupId: 'service-a',
          environment: 'PRODUCTION',
          status: 'ACTIVE',
        },
      }),
    );
    expect(mocks.connection).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        configurationId: 'config-a',
        groupMembershipId: 'membership-a',
        userId: 'user-a',
      },
      select: { status: true, friendshipStatus: true, notificationConsentAt: true },
    });
  });

  it('does not load partner or connection data when membership is absent', async () => {
    mocks.membership.mockResolvedValue(null);
    await expect(loadServiceLineSettings('service-a', 'user-b')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(mocks.partners).not.toHaveBeenCalled();
    expect(mocks.connection).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { status: 'ACTIVE', friendshipStatus: 'UNFOLLOWED', notificationConsentAt: new Date() },
    { status: 'ACTIVE', friendshipStatus: 'FOLLOWING', notificationConsentAt: null },
  ])(
    'does not claim connection complete when connection or consent is missing',
    async (connection) => {
      mocks.connection.mockResolvedValue(connection);
      expect((await loadServiceLineSettings('service-a', 'user-a')).connected).toBe(false);
    },
  );

  it('marks paused service configuration unavailable', async () => {
    mocks.configuration.mockResolvedValue({
      id: 'config-a',
      lastVerifiedAt: new Date(),
      globallyPaused: true,
    });
    expect((await loadServiceLineSettings('service-a', 'user-a')).available).toBe(false);
  });

  it('requires current service legal consent before reporting LINE settings ready', async () => {
    mocks.legalConsentView.mockResolvedValue({
      legalDocuments: [{ id: 'terms-v2' }],
      acceptedDocumentIds: ['terms-v1'],
    });
    const result = await loadServiceLineSettings('service-a', 'user-a');
    expect(result.consented).toBe(false);
    expect(mocks.legalConsentView).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'service-a', actorUserId: 'user-a' }),
    );
  });
  it('recognizes reserved learning programs even when stopped, without requiring a partner', async () => {
    mocks.partners.mockResolvedValue([]);
    mocks.programs.mockResolvedValue([{ settings: { personalLearningPilot: { enabled: false } } }]);
    const result = await loadServiceLineSettings('service-a', 'user-a');
    expect(result.learningService).toBe(true);
    expect(result.partners).toEqual([]);
    expect(mocks.programs).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        status: { in: ['ACTIVE', 'SUSPENDED'] },
      },
      select: { settings: true },
    });
  });
});
