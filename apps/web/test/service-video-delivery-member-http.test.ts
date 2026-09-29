import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  member: vi.fn(),
  public: vi.fn(),
  find: vi.fn(),
  action: vi.fn(),
  project: vi.fn(),
  render: vi.fn(),
  sign: vi.fn(),
  capability: vi.fn(),
  post: vi.fn(),
  reward: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.com' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({
  resolveMemberServiceContext: m.member,
  resolvePublicServiceContext: m.public,
}));
vi.mock('../src/video/video-render-output-storage', () => ({
  SupabaseVideoRenderOutputStorage: class {
    createDownloadUrl = m.sign;
  },
}));
vi.mock('@bunshin/database', () => ({
  PrismaVideoDeliveryRepository: class {
    findForRecipient = m.find;
    recordAction = m.action;
  },
  PrismaDailyMissionRepository: class {},
  PrismaBunshinCapabilityAssignmentRepository: class {
    find = m.capability;
  },
  PrismaMissionOutcomeRepository: class {
    recordPost = m.post;
  },
  PrismaServiceReferralRewardRepository: class {
    completeMilestone = m.reward;
  },
  prisma: { videoProject: { findFirst: m.project }, videoRender: { findFirst: m.render } },
}));
import {
  recordServiceVideoDeliveryActionResponse,
  downloadServiceVideoDeliveryResponse,
} from '../src/http/service-video-delivery-member';

const id = '00000000-0000-4000-8000-000000000001';
const delivery = {
  id,
  status: 'ACCEPTED',
  expiresAt: null,
  videoProjectId: 'project-a',
  videoRenderId: 'render-a',
};
function context(serviceId = 'service-a', workspaceId = 'workspace-a') {
  return { serviceId, workspaceId };
}
function request(origin = 'https://example.com') {
  return new Request('https://example.com/api/services/private-a/videos', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceId: 'foreign', groupId: 'foreign', ownerUserId: 'foreign' }),
  });
}
function noEffects() {
  for (const fn of [m.action, m.post, m.reward, m.sign]) expect(fn).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: 'user-a' });
  m.member.mockResolvedValue(context());
  m.find.mockResolvedValue(delivery);
  m.action.mockResolvedValue(delivery);
  m.project.mockResolvedValue({
    platform: 'INSTAGRAM',
    socialImageGenerationRequest: { bunshinId: 'bunshin-a', dailyMissionId: 'mission-a' },
  });
  m.render.mockResolvedValue({ outputStorageKey: 'workspace-a/user-a/render-a.mp4' });
  m.sign.mockResolvedValue('https://storage.example/mock-signed-video');
  m.capability.mockResolvedValue({ status: 'ACTIVE' });
  m.post.mockResolvedValue({ post: { id: 'post-a' }, activity: { id: 'activity-a' } });
  m.reward.mockResolvedValue([]);
});

describe.each(['VIEWED', 'ACCEPTED', 'DECLINED', 'POSTED'])(
  '%s video participant action',
  (action) => {
    it('accepts private members and derives actor/service scope rather than using body IDs', async () => {
      const response = await recordServiceVideoDeliveryActionResponse(
        request(),
        'private-a',
        id,
        action,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(m.member).toHaveBeenCalledExactlyOnceWith('private-a', 'user-a');
      expect(m.actor.mock.invocationCallOrder[0]).toBeLessThan(
        m.member.mock.invocationCallOrder[0]!,
      );
      expect(m.public).not.toHaveBeenCalled();
      expect(m.action).toHaveBeenCalledWith({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        actorUserId: 'user-a',
        videoDeliveryId: id,
        action,
        eventData: {},
      });
    });
    it('rejects anonymous callers before resolver or writes', async () => {
      m.actor.mockResolvedValue(null);
      expect(
        (await recordServiceVideoDeliveryActionResponse(request(), 'private-a', id, action)).status,
      ).toBe(401);
      expect(m.member).not.toHaveBeenCalled();
      noEffects();
    });
    it.each(['non-member', 'unavailable'])('rejects %s before repository work', async (slug) => {
      m.member.mockRejectedValue(new ApplicationError('NOT_FOUND', 'service unavailable'));
      expect(
        (await recordServiceVideoDeliveryActionResponse(request(), slug, id, action)).status,
      ).toBe(404);
      expect(m.find).not.toHaveBeenCalled();
      noEffects();
    });
    it('rejects a foreign origin before authentication', async () => {
      expect(
        (
          await recordServiceVideoDeliveryActionResponse(
            request('https://foreign.example'),
            'private-a',
            id,
            action,
          )
        ).status,
      ).toBe(403);
      expect(m.actor).not.toHaveBeenCalled();
      noEffects();
    });
    it('rejects invalid IDs before repository access', async () => {
      expect(
        (await recordServiceVideoDeliveryActionResponse(request(), 'private-a', 'bad-id', action))
          .status,
      ).toBe(400);
      expect(m.find).not.toHaveBeenCalled();
      noEffects();
    });
    it('uses switched workspace, service and actor consistently', async () => {
      m.actor.mockResolvedValue({ userId: 'user-b' });
      m.member.mockResolvedValue(context('service-b', 'workspace-b'));
      expect(
        (await recordServiceVideoDeliveryActionResponse(request(), 'private-b', id, action)).status,
      ).toBe(200);
      expect(m.action).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-b',
          groupId: 'service-b',
          actorUserId: 'user-b',
        }),
      );
      if (action === 'POSTED')
        expect(m.post).toHaveBeenCalledWith(
          expect.objectContaining({
            workspaceId: 'workspace-b',
            groupId: 'service-b',
            actorUserId: 'user-b',
          }),
        );
    });
    it('does not return a result after repository ownership/state refusal', async () => {
      m.action.mockResolvedValue(null);
      const response = await recordServiceVideoDeliveryActionResponse(
        request(),
        'private-a',
        id,
        action,
      );
      expect(response.status).toBe(403);
      expect((await response.json()).data).toBeUndefined();
    });
  },
);

describe('posted video availability and source', () => {
  it('rejects unknown actions before effects', async () => {
    expect(
      (await recordServiceVideoDeliveryActionResponse(request(), 'private-a', id, 'DOWNLOADED'))
        .status,
    ).toBe(400);
    noEffects();
  });
  it('refuses a foreign delivery before inspecting its project', async () => {
    m.find.mockResolvedValue(null);
    expect(
      (await recordServiceVideoDeliveryActionResponse(request(), 'private-a', id, 'POSTED')).status,
    ).toBe(404);
    expect(m.project).not.toHaveBeenCalled();
    noEffects();
  });
  it.each(['REVOKED', 'EXPIRED', 'expired-time'])(
    'refuses %s before source posting',
    async (state) => {
      m.find.mockResolvedValue({
        ...delivery,
        status: state === 'expired-time' ? 'ACCEPTED' : state,
        expiresAt: state === 'expired-time' ? new Date(0) : null,
      });
      expect(
        (await recordServiceVideoDeliveryActionResponse(request(), 'private-a', id, 'POSTED'))
          .status,
      ).toBe(403);
      expect(m.project).not.toHaveBeenCalled();
      noEffects();
    },
  );
  it.each(['ASSIGNED', 'VIEWED', 'DECLINED'])(
    'requires acceptance rather than %s',
    async (status) => {
      m.find.mockResolvedValue({ ...delivery, status });
      expect(
        (await recordServiceVideoDeliveryActionResponse(request(), 'private-a', id, 'POSTED'))
          .status,
      ).toBe(409);
      noEffects();
    },
  );
  it('returns an already posted delivery without duplicate source/reward/events', async () => {
    m.find.mockResolvedValue({ ...delivery, status: 'POSTED' });
    const response = await recordServiceVideoDeliveryActionResponse(
      request(),
      'private-a',
      id,
      'POSTED',
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    noEffects();
  });
  it('refuses unavailable or foreign projects instead of treating them as manual videos', async () => {
    m.project.mockResolvedValue(null);
    expect(
      (await recordServiceVideoDeliveryActionResponse(request(), 'private-a', id, 'POSTED')).status,
    ).toBe(404);
    noEffects();
  });
  it('keeps a manual source-less project usable', async () => {
    m.project.mockResolvedValue({ platform: 'INSTAGRAM', socialImageGenerationRequest: null });
    expect(
      (await recordServiceVideoDeliveryActionResponse(request(), 'private-a', id, 'POSTED')).status,
    ).toBe(200);
    expect(m.post).not.toHaveBeenCalled();
    expect(m.reward).not.toHaveBeenCalled();
    expect(m.action).toHaveBeenCalledOnce();
  });
  it('keeps source mission and reward keys in this actor service', async () => {
    expect(
      (await recordServiceVideoDeliveryActionResponse(request(), 'private-a', id, 'POSTED')).status,
    ).toBe(200);
    expect(m.project).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'project-a',
          workspaceId: 'workspace-a',
          groupId: 'service-a',
          ownerUserId: 'user-a',
          status: { not: 'CANCELLED' },
        },
      }),
    );
    expect(m.post).toHaveBeenCalledWith(
      expect.objectContaining({
        bunshinId: 'bunshin-a',
        dailyMissionId: 'mission-a',
        actorUserId: 'user-a',
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        idempotencyKey: `video-delivery-post:${id}`,
      }),
    );
    expect(m.reward).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        referredUserId: 'user-a',
        milestone: 'FIRST_POST_REPORTED',
      }),
    );
  });
  it.each(['capability', 'mission'])(
    'does not mark delivery posted when %s refuses',
    async (failure) => {
      if (failure === 'capability') m.capability.mockResolvedValue({ status: 'PAUSED' });
      else m.post.mockResolvedValue(null);
      expect(
        (await recordServiceVideoDeliveryActionResponse(request(), 'private-a', id, 'POSTED'))
          .status,
      ).toBe(failure === 'capability' ? 403 : 404);
      expect(m.reward).not.toHaveBeenCalled();
      expect(m.action).not.toHaveBeenCalled();
    },
  );
});

describe('private participant download', () => {
  it('prepares the exact owned render URL before recording and returns an uncached redirect', async () => {
    const response = await downloadServiceVideoDeliveryResponse('private-a', id);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://storage.example/mock-signed-video');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(m.member).toHaveBeenCalledExactlyOnceWith('private-a', 'user-a');
    expect(m.public).not.toHaveBeenCalled();
    expect(m.render).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'render-a',
          videoProjectId: 'project-a',
          workspaceId: 'workspace-a',
          groupId: 'service-a',
          ownerUserId: 'user-a',
          status: 'SUCCEEDED',
          deletedAt: null,
          project: { status: { not: 'CANCELLED' } },
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        }),
      }),
    );
    expect(m.sign).toHaveBeenCalledExactlyOnceWith('workspace-a/user-a/render-a.mp4');
    expect(m.action).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      groupId: 'service-a',
      actorUserId: 'user-a',
      videoDeliveryId: id,
      action: 'DOWNLOADED',
      eventData: {},
    });
    expect(m.sign.mock.invocationCallOrder[0]).toBeLessThan(m.action.mock.invocationCallOrder[0]!);
  });
  it('uses only the switched service/actor render key', async () => {
    m.member.mockResolvedValue(context('service-b', 'workspace-b'));
    m.actor.mockResolvedValue({ userId: 'user-b' });
    m.render.mockResolvedValue({ outputStorageKey: 'workspace-b/user-b/render-a.mp4' });
    expect((await downloadServiceVideoDeliveryResponse('private-b', id)).status).toBe(302);
    expect(m.find).toHaveBeenCalledWith({
      workspaceId: 'workspace-b',
      groupId: 'service-b',
      actorUserId: 'user-b',
      videoDeliveryId: id,
    });
    expect(m.sign).toHaveBeenCalledWith('workspace-b/user-b/render-a.mp4');
  });
  it('rejects anonymous actors before resolution or storage', async () => {
    m.actor.mockResolvedValue(null);
    expect((await downloadServiceVideoDeliveryResponse('private-a', id)).status).toBe(401);
    expect(m.member).not.toHaveBeenCalled();
    noEffects();
  });
  it('rejects invalid IDs before recipient lookup', async () => {
    expect((await downloadServiceVideoDeliveryResponse('private-a', 'bad-id')).status).toBe(400);
    expect(m.find).not.toHaveBeenCalled();
    noEffects();
  });
  it.each(['resolver', 'recipient'])(
    'rejects %s ownership refusal without storage or events',
    async (failure) => {
      if (failure === 'resolver')
        m.member.mockRejectedValue(new ApplicationError('NOT_FOUND', 'service unavailable'));
      else m.find.mockResolvedValue(null);
      expect((await downloadServiceVideoDeliveryResponse('private-a', id)).status).toBe(404);
      noEffects();
    },
  );
  it.each(['ASSIGNED', 'VIEWED', 'DECLINED', 'REVOKED', 'EXPIRED', 'expired-time'])(
    'rejects unavailable state %s before storage',
    async (state) => {
      m.find.mockResolvedValue({
        ...delivery,
        status: state === 'expired-time' ? 'ACCEPTED' : state,
        expiresAt: state === 'expired-time' ? new Date(0) : null,
      });
      expect((await downloadServiceVideoDeliveryResponse('private-a', id)).status).toBe(403);
      expect(m.render).not.toHaveBeenCalled();
      noEffects();
    },
  );
  it('permits a still-available posted delivery', async () => {
    m.find.mockResolvedValue({ ...delivery, status: 'POSTED' });
    expect((await downloadServiceVideoDeliveryResponse('private-a', id)).status).toBe(302);
  });
  it.each([
    null,
    'foreign/user-a/render-a.mp4',
    'workspace-a/foreign/render-a.mp4',
    'workspace-a/user-a/foreign.mp4',
  ])('refuses unavailable or foreign storage key %s', async (outputStorageKey) => {
    m.render.mockResolvedValue(outputStorageKey === null ? null : { outputStorageKey });
    expect((await downloadServiceVideoDeliveryResponse('private-a', id)).status).toBe(404);
    noEffects();
  });
  it('does not count failed signing as downloaded or expose a redirect', async () => {
    m.sign.mockRejectedValue(new Error('mock signing failure'));
    const response = await downloadServiceVideoDeliveryResponse('private-a', id);
    expect(response.status).toBe(500);
    expect(response.headers.get('location')).toBeNull();
    expect(m.action).not.toHaveBeenCalled();
  });
  it('does not disclose a prepared URL when the final recipient/state recheck refuses', async () => {
    m.action.mockResolvedValue(null);
    const response = await downloadServiceVideoDeliveryResponse('private-a', id);
    expect(response.status).toBe(403);
    expect(response.headers.get('location')).toBeNull();
  });
  it.each(['resolver', 'auth'])(
    'does not disguise unknown %s errors as missing video',
    async (failure) => {
      (failure === 'resolver' ? m.member : m.actor).mockRejectedValue(
        new Error('mock unavailable'),
      );
      const response = await downloadServiceVideoDeliveryResponse('private-a', id);
      expect(response.status).toBe(500);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      noEffects();
    },
  );
});
