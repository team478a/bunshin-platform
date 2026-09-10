import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  authorize: vi.fn(),
  create: vi.fn(),
  transition: vi.fn(),
  findOwned: vi.fn(),
  listMediaOwned: vi.fn(),
  setMediaStatus: vi.fn(),
  enqueue: vi.fn(),
  listCatalog: vi.fn(),
  reservePoint: vi.fn(),
  transitionPoint: vi.fn(),
  consumeBadgeEntitlement: vi.fn(),
  refundBadgeEntitlement: vi.fn(),
  consumeServiceCredit: vi.fn(),
  refundServiceCredit: vi.fn(),
  organizationEntitlement: vi.fn(),
  imageUsageCount: vi.fn(),
  reserveServiceMedia: vi.fn(),
  finishServiceMedia: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: vi.fn().mockReturnValue({ APP_ENV: 'production' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: vi.fn().mockResolvedValue({
    getCurrentUser: vi.fn().mockResolvedValue({
      userId: '00000000-0000-4000-8000-000000000004',
    }),
  }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: vi.fn() }));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  resolveOpenAiRuntimeConfiguration: vi.fn().mockResolvedValue({
    apiKey: 'not-used-by-http',
    model: 'gpt-image-1',
    requestCostUsdMicros: 50_000,
    source: 'ADMIN_CONFIGURATION',
  }),
}));
vi.mock('../src/service-media-generation-quota', () => ({
  reserveServiceMediaGeneration: fakes.reserveServiceMedia,
  finishServiceMediaGeneration: fakes.finishServiceMedia,
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    organizationEntitlement: { findUnique: fakes.organizationEntitlement },
    socialImageGenerationRequest: { count: fakes.imageUsageCount },
  },
  PrismaSocialImageGenerationAuthorizationRepository: class {
    authorize = fakes.authorize;
  },
  PrismaSocialImageGenerationRequestRepository: class {
    create = fakes.create;
    transition = fakes.transition;
    findOwned = fakes.findOwned;
    listMediaOwned = fakes.listMediaOwned;
    setMediaStatus = fakes.setMediaStatus;
  },
  PrismaJobRepository: class {
    enqueue = fakes.enqueue;
  },
  PrismaPointRedemptionRepository: class {
    listCatalog = fakes.listCatalog;
    reserve = fakes.reservePoint;
    transition = fakes.transitionPoint;
  },
  PrismaBadgeEntitlementConsumptionRepository: class {
    consume = fakes.consumeBadgeEntitlement;
    refund = fakes.refundBadgeEntitlement;
  },
  PrismaServiceCreditConsumptionRepository: class {
    consumeForSocialImage = fakes.consumeServiceCredit;
    refundSocialImage = fakes.refundServiceCredit;
  },
}));

import {
  createSocialImageResponse,
  decideSocialImageResponse,
  getSocialImageResponse,
} from '../src/http/social-images';

const ids = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  groupId: '00000000-0000-4000-8000-000000000002',
  groupMembershipId: '00000000-0000-4000-8000-000000000003',
  actorUserId: '00000000-0000-4000-8000-000000000004',
  bunshinId: '00000000-0000-4000-8000-000000000005',
  dailyMissionId: '00000000-0000-4000-8000-000000000006',
  pilotEnrollmentId: '00000000-0000-4000-8000-000000000007',
  requestId: '00000000-0000-4000-8000-000000000008',
};

const layout = {
  templateKey: 'THREE_POINTS',
  headline: '今日の3つ',
  bodyLines: ['ひとつ', 'ふたつ', 'みっつ'],
  cta: '保存してください',
  accentColor: '#FF3B30',
};

const row = (status: 'DRAFT' | 'QUEUED', revision: number) => ({
  id: ids.requestId,
  workspaceId: ids.workspaceId,
  groupId: ids.groupId,
  groupMembershipId: ids.groupMembershipId,
  ownerUserId: ids.actorUserId,
  bunshinId: ids.bunshinId,
  dailyMissionId: ids.dailyMissionId,
  campaignId: null,
  productPackVersionId: null,
  generationContextSnapshotId: null,
  pilotEnrollmentId: ids.pilotEnrollmentId,
  status,
  templateKey: layout.templateKey,
  layout,
  idempotencyKey: 'client-operation-1',
  revision,
  errorCode: null,
  createdAt: new Date('2026-08-28T00:00:00.000Z'),
  updatedAt: new Date('2026-08-28T00:00:00.000Z'),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('APP_URL', 'https://example.com');
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  vi.stubEnv('DIRECT_URL', 'postgres://test');
  vi.stubEnv('SESSION_SECRET', 'session-secret-at-least-thirty-two-bytes');
  fakes.authorize.mockResolvedValue({
    allowed: true,
    pilotEnrollmentId: ids.pilotEnrollmentId,
    generationContextSnapshotId: null,
  });
  fakes.create.mockResolvedValue(row('DRAFT', 1));
  fakes.transition.mockResolvedValue(row('QUEUED', 2));
  fakes.enqueue.mockResolvedValue({ id: 'job-1' });
  fakes.findOwned.mockResolvedValue(row('QUEUED', 2));
  fakes.listMediaOwned.mockResolvedValue([]);
  fakes.listCatalog.mockResolvedValue([
    {
      id: '00000000-0000-4000-8000-000000000501',
      rewardKey: 'SOCIAL_IMAGE_GENERATION',
      version: 1,
      rewardType: 'SOCIAL_IMAGE_GENERATION',
      title: '投稿用の画像を1回作る',
      description: '投稿内容に合う画像を1回作れます。',
      pointCost: 50,
    },
  ]);
  fakes.reservePoint.mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000510',
    status: 'RESERVED',
  });
  fakes.transitionPoint.mockImplementation(({ targetStatus }) =>
    Promise.resolve({ id: '00000000-0000-4000-8000-000000000510', status: targetStatus }),
  );
  fakes.consumeBadgeEntitlement.mockResolvedValue(null);
  fakes.refundBadgeEntitlement.mockImplementation(({ usageId, reason }) =>
    Promise.resolve({ id: usageId, status: 'REFUNDED', refundReason: reason }),
  );
  fakes.consumeServiceCredit.mockResolvedValue({ status: 'NOT_CONFIGURED' });
  fakes.refundServiceCredit.mockResolvedValue(undefined);
  fakes.organizationEntitlement.mockResolvedValue(null);
  fakes.imageUsageCount.mockResolvedValue(0);
  fakes.reserveServiceMedia.mockResolvedValue({ status: 'NOT_CONFIGURED', id: null });
  fakes.finishServiceMedia.mockResolvedValue(undefined);
});

describe('social image HTTP', () => {
  it('returns every carousel page with an owned download path', async () => {
    fakes.findOwned.mockResolvedValue({ ...row('QUEUED', 2), status: 'READY_FOR_REVIEW' });
    fakes.listMediaOwned.mockResolvedValue(
      [0, 1, 2].map((pageIndex) => ({
        id: `00000000-0000-4000-8000-00000000010${pageIndex}`,
        pageIndex,
        status: 'READY',
        width: 1080,
        height: 1350,
      })),
    );
    const response = await getSocialImageResponse(
      new Request('https://example.com/api/images/request'),
      ids.workspaceId,
      ids.groupId,
      ids.requestId,
    );
    const payload = (await response.json()) as {
      data: {
        mediaPages: Array<{ pageIndex: number; downloadPath: string; savePath: string }>;
      };
    };
    expect(payload.data.mediaPages.map((page) => page.pageIndex)).toEqual([0, 1, 2]);
    expect(payload.data.mediaPages[1]?.downloadPath).toContain('mediaId=');
    expect(payload.data.mediaPages[1]?.savePath).toContain('download=1');
  });

  it('creates, queues and returns only safe request fields', async () => {
    const response = await createSocialImageResponse(
      new Request('https://example.com/api/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groupMembershipId: ids.groupMembershipId,
          idempotencyKey: 'client-operation-1',
          layout,
        }),
      }),
      ids.workspaceId,
      ids.groupId,
      ids.bunshinId,
      ids.dailyMissionId,
    );
    expect(response.status).toBe(202);
    const value = await response.json();
    expect(value.data).toMatchObject({ id: ids.requestId, status: 'QUEUED', revision: 2 });
    expect(value.data).not.toHaveProperty('ownerUserId');
    expect(fakes.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'SOCIAL_IMAGE_GENERATE',
        payloadReference: `social-image:${ids.requestId}`,
        idempotencyKey: `social-image:${ids.requestId}`,
      }),
    );
    expect(fakes.reservePoint).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'SOCIAL_IMAGE_REQUEST',
        resourceId: ids.requestId,
      }),
    );
    expect(fakes.transitionPoint).toHaveBeenCalledWith(
      expect.objectContaining({ targetStatus: 'CONFIRMED' }),
    );
  });

  it('refunds confirmed points when the request cannot be enqueued', async () => {
    fakes.enqueue.mockRejectedValueOnce(new Error('queue unavailable'));
    const response = await createSocialImageResponse(
      new Request('https://example.com/api/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groupMembershipId: ids.groupMembershipId,
          idempotencyKey: 'client-operation-2',
          layout,
        }),
      }),
      ids.workspaceId,
      ids.groupId,
      ids.bunshinId,
      ids.dailyMissionId,
    );
    expect(response.status).toBe(500);
    expect(fakes.transitionPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        targetStatus: 'REFUNDED',
        reason: 'IMAGE_REQUEST_NOT_ENQUEUED',
      }),
    );
  });

  it('uses an image entitlement before points and restores it when enqueue fails', async () => {
    fakes.consumeBadgeEntitlement.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000520',
      status: 'CONSUMED',
    });
    fakes.enqueue.mockRejectedValueOnce(new Error('queue unavailable'));
    const response = await createSocialImageResponse(
      new Request('https://example.com/api/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groupMembershipId: ids.groupMembershipId,
          idempotencyKey: 'client-operation-entitlement',
          layout,
        }),
      }),
      ids.workspaceId,
      ids.groupId,
      ids.bunshinId,
      ids.dailyMissionId,
    );
    expect(response.status).toBe(500);
    expect(fakes.reservePoint).not.toHaveBeenCalled();
    expect(fakes.refundBadgeEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'IMAGE_REQUEST_NOT_ENQUEUED' }),
    );
  });

  it('uses a service image credit before the legacy point and badge flows', async () => {
    fakes.consumeServiceCredit.mockResolvedValueOnce({ status: 'CONSUMED', availableCredits: 2 });
    const response = await createSocialImageResponse(
      new Request('https://example.com/api/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groupMembershipId: ids.groupMembershipId,
          idempotencyKey: 'client-operation-credit',
          layout,
        }),
      }),
      ids.workspaceId,
      ids.groupId,
      ids.bunshinId,
      ids.dailyMissionId,
    );
    expect(response.status).toBe(202);
    expect(fakes.consumeServiceCredit).toHaveBeenCalledWith(
      expect.objectContaining({ imageRequestId: ids.requestId }),
    );
    expect(fakes.consumeBadgeEntitlement).not.toHaveBeenCalled();
    expect(fakes.reservePoint).not.toHaveBeenCalled();
  });

  it('uses the commercial Service image allowance without charging legacy balances', async () => {
    fakes.reserveServiceMedia.mockResolvedValueOnce({
      status: 'RESERVED',
      id: '00000000-0000-4000-8000-000000000530',
    });
    const response = await createSocialImageResponse(
      new Request('https://example.com/api/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groupMembershipId: ids.groupMembershipId,
          idempotencyKey: 'client-operation-plan',
          layout,
        }),
      }),
      ids.workspaceId,
      ids.groupId,
      ids.bunshinId,
      ids.dailyMissionId,
    );
    expect(response.status).toBe(202);
    expect(fakes.consumeServiceCredit).not.toHaveBeenCalled();
    expect(fakes.consumeBadgeEntitlement).not.toHaveBeenCalled();
    expect(fakes.reservePoint).not.toHaveBeenCalled();
  });

  it('releases a new commercial Service reservation when queueing fails', async () => {
    const serviceReservation = {
      status: 'RESERVED' as const,
      id: '00000000-0000-4000-8000-000000000530',
    };
    fakes.reserveServiceMedia.mockResolvedValueOnce(serviceReservation);
    fakes.enqueue.mockRejectedValueOnce(new Error('queue unavailable'));
    const response = await createSocialImageResponse(
      new Request('https://example.com/api/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groupMembershipId: ids.groupMembershipId,
          idempotencyKey: 'client-operation-plan-release',
          layout,
        }),
      }),
      ids.workspaceId,
      ids.groupId,
      ids.bunshinId,
      ids.dailyMissionId,
    );
    expect(response.status).toBe(500);
    expect(fakes.finishServiceMedia).toHaveBeenCalledWith({
      reservation: serviceReservation,
      outcome: 'RELEASED',
    });
  });

  it('returns a service image credit when queueing fails', async () => {
    fakes.consumeServiceCredit.mockResolvedValueOnce({ status: 'CONSUMED', availableCredits: 2 });
    fakes.enqueue.mockRejectedValueOnce(new Error('queue unavailable'));
    const response = await createSocialImageResponse(
      new Request('https://example.com/api/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groupMembershipId: ids.groupMembershipId,
          idempotencyKey: 'client-operation-credit-refund',
          layout,
        }),
      }),
      ids.workspaceId,
      ids.groupId,
      ids.bunshinId,
      ids.dailyMissionId,
    );
    expect(response.status).toBe(500);
    expect(fakes.refundServiceCredit).toHaveBeenCalledWith(
      expect.objectContaining({ imageRequestId: ids.requestId }),
    );
  });

  it('records an image adoption without returning storage keys', async () => {
    fakes.findOwned.mockResolvedValue({ ...row('QUEUED', 2), status: 'READY_FOR_REVIEW' });
    fakes.setMediaStatus.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000009',
      status: 'ADOPTED',
    });
    const response = await decideSocialImageResponse(
      new Request('https://example.com/api/images/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mediaId: '00000000-0000-4000-8000-000000000009',
          decision: 'ADOPTED',
        }),
      }),
      ids.workspaceId,
      ids.groupId,
      ids.requestId,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { status: 'ADOPTED' } });
  });
});
