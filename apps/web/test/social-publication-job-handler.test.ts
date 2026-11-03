import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  claim: vi.fn(),
  recordContainer: vi.fn(),
  begin: vi.fn(),
  complete: vi.fn(),
  markFailed: vi.fn(),
  token: vi.fn(),
  jpeg: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
  inspect: vi.fn(),
  publish: vi.fn(),
  accountIds: '17841400000000000',
}));

vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({
    INSTAGRAM_PUBLISH_TEST_ACCOUNT_IDS: f.accountIds,
    INSTAGRAM_GRAPH_API_VERSION: 'v26.0',
  }),
}));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaSocialPublicationIntents: class {
    claim = f.claim;
    recordContainer = f.recordContainer;
    beginAmbiguousPublish = f.begin;
    complete = f.complete;
    markFailed = f.markFailed;
  },
}));
vi.mock('../src/services/social-account-connection-owner', () => ({
  socialAccountConnections: () => Promise.resolve({ getUsableAccessToken: f.token }),
}));
vi.mock('../src/social-image-storage', () => ({
  SupabaseSocialImageStorage: class {
    createPublishingJpegUrl = f.jpeg;
    removePublishingJpeg = f.remove;
  },
}));
vi.mock('../src/providers/instagram-direct-publishing', () => ({
  InstagramPublishingError: class extends Error {},
  InstagramDirectPublishingAdapter: class {
    createImageContainer = f.create;
    inspectContainer = f.inspect;
    publishFinishedContainer = f.publish;
  },
}));

import { createSocialPublicationJobHandler } from '../src/jobs/social-publication-job-handler';

const claimed = {
  terminal: false as const,
  owner: {
    workspaceId: 'workspace-1',
    serviceId: 'service-1',
    groupMembershipId: 'membership-1',
    userId: 'user-1',
    bunshinId: 'bunshin-1',
  },
  connection: { externalAccountId: '17841400000000000' },
  intent: {
    id: '00000000-0000-4000-8000-000000000001',
    connectionId: 'connection-1',
    containerId: null,
    caption: 'approved caption',
  },
  media: { completedStorageKey: 'owner/media/completed.png' },
};

beforeEach(() => {
  vi.clearAllMocks();
  f.accountIds = '17841400000000000';
  f.claim.mockResolvedValue(claimed);
  f.token.mockResolvedValue('private-token');
  f.jpeg.mockResolvedValue('https://storage.example/publish.jpg?signature=opaque');
  f.create.mockResolvedValue({ containerId: '123456789' });
  f.inspect.mockResolvedValue('FINISHED');
  f.publish.mockResolvedValue({ externalPostId: '987654321' });
});

describe('Instagram social publication Job handler', () => {
  it('persists UNKNOWN before media_publish and records success afterward', async () => {
    await createSocialPublicationJobHandler().execute({
      workspaceId: 'workspace-1',
      intentId: claimed.intent.id,
      actorUserId: 'user-1',
      attemptCount: 1,
    });
    expect(f.begin).toHaveBeenCalledWith(claimed.intent.id, '123456789');
    expect(f.begin.mock.invocationCallOrder[0]).toBeLessThan(
      f.publish.mock.invocationCallOrder[0]!,
    );
    expect(f.complete).toHaveBeenCalledWith(claimed.intent.id, '987654321');
    expect(f.remove).toHaveBeenCalled();
    expect(JSON.stringify(f.complete.mock.calls)).not.toContain('private-token');
  });

  it('keeps UNKNOWN and resolves the Job without an automatic resend after a lost response', async () => {
    f.publish.mockRejectedValue(new Error('lost response'));
    await expect(
      createSocialPublicationJobHandler().execute({
        workspaceId: 'workspace-1',
        intentId: claimed.intent.id,
        actorUserId: 'user-1',
        attemptCount: 1,
      }),
    ).resolves.toBeUndefined();
    expect(f.begin).toHaveBeenCalledTimes(1);
    expect(f.publish).toHaveBeenCalledTimes(1);
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });

  it('fails closed before token access for a non-test account', async () => {
    f.accountIds = '';
    await expect(
      createSocialPublicationJobHandler().execute({
        workspaceId: 'workspace-1',
        intentId: claimed.intent.id,
        actorUserId: 'user-1',
        attemptCount: 1,
      }),
    ).rejects.toMatchObject({ category: 'INSTAGRAM_TEST_ACCOUNT_REQUIRED', retryable: false });
    expect(f.token).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  });
});
