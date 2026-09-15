import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  findDelivery: vi.fn(),
  recordAction: vi.fn(),
  project: vi.fn(),
  recordPost: vi.fn(),
  referral: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({
  resolvePublicServiceContext: () =>
    Promise.resolve({ workspaceId: 'workspace', serviceId: 'group' }),
  resolveManagedServiceContext: vi.fn(),
}));
vi.mock('@bunshin/database', () => ({
  prisma: { videoProject: { findFirst: m.project } },
  PrismaVideoDeliveryRepository: class {
    findForRecipient = m.findDelivery;
    recordAction = m.recordAction;
  },
  PrismaDailyMissionRepository: class {},
  PrismaBunshinCapabilityAssignmentRepository: class {
    find() {
      return Promise.resolve({ status: 'ACTIVE' });
    }
  },
  PrismaMissionOutcomeRepository: class {
    recordPost = m.recordPost;
  },
  PrismaServiceReferralRewardRepository: class {
    completeMilestone = m.referral;
  },
}));

import { recordServiceVideoDeliveryActionResponse } from '../src/http/service-video-deliveries';

const deliveryId = '00000000-0000-4000-8000-000000000001';
const existing = {
  id: deliveryId,
  videoProjectId: 'project',
  status: 'ACCEPTED',
};

function request() {
  return new Request(
    `https://example.com/api/services/service/video-deliveries/${deliveryId}/POSTED`,
    {
      method: 'POST',
      headers: { origin: 'https://example.com' },
    },
  );
}

describe('service video posting completion', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'https://example.com');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('LOG_LEVEL', 'info');
    m.actor.mockResolvedValue({ userId: 'owner' });
    m.findDelivery.mockResolvedValue(existing);
    m.project.mockResolvedValue({
      platform: 'INSTAGRAM',
      socialImageGenerationRequest: { bunshinId: 'bunshin', dailyMissionId: 'mission' },
    });
    m.recordPost.mockResolvedValue({ post: { id: 'post' }, activity: { id: 'activity' } });
    m.referral.mockResolvedValue([]);
    m.recordAction.mockResolvedValue({ ...existing, status: 'POSTED' });
  });

  it('records the source mission before marking the delivered video as posted', async () => {
    const response = await recordServiceVideoDeliveryActionResponse(
      request(),
      'service',
      deliveryId,
      'POSTED',
    );
    expect(response.status).toBe(200);
    expect(m.recordPost).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace',
        groupId: 'group',
        bunshinId: 'bunshin',
        dailyMissionId: 'mission',
        actorUserId: 'owner',
        platform: 'INSTAGRAM',
        idempotencyKey: `video-delivery-post:${deliveryId}`,
      }),
    );
    expect(m.referral).toHaveBeenCalledWith(
      expect.objectContaining({ milestone: 'FIRST_POST_REPORTED' }),
    );
    expect(m.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({ videoDeliveryId: deliveryId, action: 'POSTED' }),
    );
    expect(m.recordPost.mock.invocationCallOrder[0]).toBeLessThan(
      m.recordAction.mock.invocationCallOrder[0]!,
    );
  });

  it('returns an already posted delivery without recording duplicate events or rewards', async () => {
    m.findDelivery.mockResolvedValue({ ...existing, status: 'POSTED' });
    const response = await recordServiceVideoDeliveryActionResponse(
      request(),
      'service',
      deliveryId,
      'POSTED',
    );
    expect(response.status).toBe(200);
    expect(m.recordPost).not.toHaveBeenCalled();
    expect(m.referral).not.toHaveBeenCalled();
    expect(m.recordAction).not.toHaveBeenCalled();
  });

  it('keeps manually assigned videos usable when they have no source mission', async () => {
    m.project.mockResolvedValue({ platform: 'INSTAGRAM', socialImageGenerationRequest: null });
    const response = await recordServiceVideoDeliveryActionResponse(
      request(),
      'service',
      deliveryId,
      'POSTED',
    );
    expect(response.status).toBe(200);
    expect(m.recordPost).not.toHaveBeenCalled();
    expect(m.recordAction).toHaveBeenCalledOnce();
  });
});
