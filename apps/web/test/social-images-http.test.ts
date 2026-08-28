import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  authorize: vi.fn(),
  create: vi.fn(),
  transition: vi.fn(),
  enqueue: vi.fn(),
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
vi.mock('@bunshin/database', () => ({
  PrismaSocialImageGenerationAuthorizationRepository: class {
    authorize = fakes.authorize;
  },
  PrismaSocialImageGenerationRequestRepository: class {
    create = fakes.create;
    transition = fakes.transition;
  },
  PrismaJobRepository: class {
    enqueue = fakes.enqueue;
  },
}));

import { createSocialImageResponse } from '../src/http/social-images';

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
});

describe('social image HTTP', () => {
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
  });
});
