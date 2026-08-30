import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({ findPublicBySlug: vi.fn() }));
vi.mock('@bunshin/database', () => ({
  PrismaServiceFoundationRepository: class {
    findPublicBySlug = state.findPublicBySlug;
  },
}));

import { resolvePublicServiceContext } from '../src/services/public-service';

const configuration = {
  id: 'configuration-1',
  workspaceId: 'workspace-1',
  groupId: 'service-1',
  slug: 'side-job-support',
  displayName: '投稿副業サポート',
  description: '初心者向けサービス',
  operatorName: '運営事務局',
  contactEmail: null,
  visibility: 'PUBLIC' as const,
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
    emailEnabled: true,
    lineEnabled: true,
    inviteCodeEnabled: false,
    referralEnabled: false,
    onboardingConfig: {},
    surveyConfig: {},
  },
};

describe('public service context', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the server-resolved Group as the service boundary', async () => {
    state.findPublicBySlug.mockResolvedValue(configuration);
    await expect(resolvePublicServiceContext('side-job-support')).resolves.toMatchObject({
      workspaceId: 'workspace-1',
      serviceId: 'service-1',
      configuration: { slug: 'side-job-support' },
    });
    expect(state.findPublicBySlug).toHaveBeenCalledWith({
      slug: 'side-job-support',
      now: expect.any(Date),
    });
  });

  it.each(['Bad-Slug', '../admin', 'service?next=evil', ''])(
    'rejects an invalid slug: %s',
    async (slug) => {
      await expect(resolvePublicServiceContext(slug)).rejects.toThrow('SERVICE_NOT_FOUND');
      expect(state.findPublicBySlug).not.toHaveBeenCalled();
    },
  );
});
