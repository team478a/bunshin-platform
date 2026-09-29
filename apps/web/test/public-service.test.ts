import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({ findPublicBySlug: vi.fn(), findMemberBySlug: vi.fn() }));
vi.mock('@bunshin/database', () => ({
  PrismaServiceFoundationRepository: class {
    findPublicBySlug = state.findPublicBySlug;
    findMemberBySlug = state.findMemberBySlug;
  },
}));

import {
  resolveMemberServiceContext,
  resolvePublicServiceContext,
  resolveVisitorServiceContext,
} from '../src/services/public-service';

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

  it('applies public registration while retaining the configured channels', async () => {
    state.findPublicBySlug.mockResolvedValue({
      ...configuration,
      registration: {
        ...configuration.registration,
        mode: 'CLOSED',
        emailEnabled: true,
        lineEnabled: false,
        inviteCodeEnabled: true,
        referralEnabled: true,
        onboardingConfig: { businessProfileEnabled: true },
      },
    });

    await expect(resolvePublicServiceContext('side-job-support')).resolves.toMatchObject({
      configuration: {
        registration: {
          mode: 'PUBLIC',
          emailEnabled: true,
          lineEnabled: false,
          inviteCodeEnabled: false,
          referralEnabled: false,
        },
      },
    });
  });

  it('allows an active member to open a private service during limited operation', async () => {
    state.findMemberBySlug.mockResolvedValue({ ...configuration, visibility: 'PRIVATE' });

    await expect(
      resolveMemberServiceContext('side-job-support', 'member-1'),
    ).resolves.toMatchObject({
      workspaceId: 'workspace-1',
      serviceId: 'service-1',
      configuration: { slug: 'side-job-support', visibility: 'PRIVATE' },
    });
    expect(state.findMemberBySlug).toHaveBeenCalledWith({
      slug: 'side-job-support',
      actorUserId: 'member-1',
      now: expect.any(Date),
    });
  });

  it('uses member access for a private service visitor without a public lookup', async () => {
    state.findMemberBySlug.mockResolvedValue({ ...configuration, visibility: 'PRIVATE' });
    await expect(
      resolveVisitorServiceContext('side-job-support', 'member-1'),
    ).resolves.toMatchObject({
      configuration: { visibility: 'PRIVATE' },
      workspaceId: 'workspace-1',
      serviceId: 'service-1',
    });
    expect(state.findPublicBySlug).not.toHaveBeenCalled();
  });

  it('keeps anonymous and authenticated nonmembers on public-only access', async () => {
    state.findMemberBySlug.mockRejectedValue(new ApplicationError('NOT_FOUND', 'not a member'));
    state.findPublicBySlug.mockResolvedValue(configuration);
    await expect(resolveVisitorServiceContext('side-job-support', null)).resolves.toMatchObject({
      workspaceId: 'workspace-1',
    });
    expect(state.findMemberBySlug).not.toHaveBeenCalled();
    await expect(
      resolveVisitorServiceContext('side-job-support', 'other-user'),
    ).resolves.toMatchObject({
      workspaceId: 'workspace-1',
    });
    expect(state.findPublicBySlug).toHaveBeenCalledTimes(2);
  });

  it('does not expose a private service to anonymous or unrelated visitors', async () => {
    state.findMemberBySlug.mockRejectedValue(new ApplicationError('NOT_FOUND', 'not a member'));
    state.findPublicBySlug.mockRejectedValue(new ApplicationError('NOT_FOUND', 'private'));
    await expect(resolveVisitorServiceContext('side-job-support', null)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      resolveVisitorServiceContext('side-job-support', 'other-user'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('does not turn an unexpected member lookup failure into public access', async () => {
    state.findMemberBySlug.mockRejectedValue(new Error('database offline'));
    state.findPublicBySlug.mockResolvedValue(configuration);
    await expect(resolveVisitorServiceContext('side-job-support', 'member-1')).rejects.toThrow(
      'database offline',
    );
    expect(state.findPublicBySlug).not.toHaveBeenCalled();
  });

  it.each(['Bad-Slug', '../admin', 'service?next=evil', ''])(
    'rejects an invalid slug: %s',
    async (slug) => {
      await expect(resolvePublicServiceContext(slug)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(state.findPublicBySlug).not.toHaveBeenCalled();
    },
  );
});
