import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  member: vi.fn(),
  public: vi.fn(),
  list: vi.fn(),
  copy: vi.fn(),
  capability: vi.fn(),
  decide: vi.fn(),
  activity: vi.fn(),
  post: vi.fn(),
  feedback: vi.fn(),
  getPost: vi.fn(),
  snapshot: vi.fn(),
  update: vi.fn(),
  milestone: vi.fn(),
  usage: vi.fn(),
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
vi.mock('../src/services/commercial-usage', () => ({ recordCommercialUsageSafely: m.usage }));
vi.mock('@bunshin/database', () => ({
  PrismaDailyMissionRepository: class {
    list = m.list;
    authorizeCopy = m.copy;
  },
  PrismaBunshinCapabilityAssignmentRepository: class {
    find = m.capability;
  },
  PrismaMissionEngagementRepository: class {
    decide = m.decide;
    appendActivity = m.activity;
  },
  PrismaMissionOutcomeRepository: class {
    recordPost = m.post;
    recordFeedback = m.feedback;
    getPost = m.getPost;
  },
  PrismaGenerationContextSnapshotRepository: class {
    find = m.snapshot;
  },
  PrismaServiceReferralRewardRepository: class {
    completeMilestone = m.milestone;
  },
  prisma: { postRecord: { update: m.update } },
}));
import { listServiceDailyMissionsResponse } from '../src/http/service-daily-mission-generation';
import {
  authorizeServiceDailyMissionCopyResponse,
  decideServiceDailyMissionResponse,
  recordServiceMissionActivityResponse,
} from '../src/http/service-daily-mission-engagement';
import {
  recordServicePostResponse,
  recordServiceMissionFeedbackResponse,
  recordServiceBusinessOutcomeResponse,
  recordServiceSocialGoalOutcomeResponse,
} from '../src/http/service-daily-mission-outcomes';
import {
  businessOutcomeSchema,
  serviceDailyMissionScope,
} from '../src/http/service-daily-mission-http-core';

const id = '00000000-0000-4000-8000-000000000001';
const dates = { createdAt: new Date(), updatedAt: new Date() };
const activity = { id: 'activity-a', occurredAt: new Date(), ...dates };
const post = { id: 'post-a', postedAt: new Date(), manualMetrics: { existing: 1 }, ...dates };
const outcomes = {
  inquiries: 1,
  reservations: 0,
  visits: 0,
  repeatReservations: 1,
  repeatVisits: 0,
  orders: 0,
  other: 0,
};
function context(serviceId = 'service-a', workspaceId = 'workspace-a', enabled = true) {
  return {
    workspaceId,
    serviceId,
    configuration: {
      registration: { onboardingConfig: { businessProfileEnabled: enabled }, surveyConfig: {} },
    },
  };
}
function request(value: unknown, origin = 'https://example.com') {
  return new Request('https://example.com/api/services/private-a/posting', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
}
const operations: Array<{
  name: string;
  read?: boolean;
  body: Record<string, unknown>;
  repo: ReturnType<typeof vi.fn>;
  run: (r: Request, slug: string, bunshin: string) => Promise<Response>;
  capability?: boolean;
}> = [
  { name: 'list', read: true, body: {}, repo: m.list, run: listServiceDailyMissionsResponse },
  {
    name: 'copy',
    body: {},
    repo: m.copy,
    run: (r, s, b) => authorizeServiceDailyMissionCopyResponse(r, s, b, id),
  },
  ...(['ACCEPTED', 'REJECTED'] as const).map((decision) => ({
    name: decision,
    body:
      decision === 'ACCEPTED'
        ? { decision, idempotencyKey: 'key-a' }
        : { decision, rejectionReason: 'OTHER', idempotencyKey: 'key-a' },
    repo: m.decide,
    capability: true,
    run: (r: Request, s: string, b: string) => decideServiceDailyMissionResponse(r, s, b, id),
  })),
  ...[
    'EXECUTION_COMPLETED',
    'EXECUTION_PARTIAL',
    'EXECUTION_NOT_COMPLETED',
    'EXECUTION_HELP_NEEDED',
  ].map((type) => ({
    name: type,
    body: { type, idempotencyKey: 'key-a' },
    repo: m.activity,
    capability: true,
    run: (r: Request, s: string, b: string) => recordServiceMissionActivityResponse(r, s, b, id),
  })),
  {
    name: 'post',
    body: { platform: 'X', idempotencyKey: 'key-a' },
    repo: m.post,
    capability: true,
    run: (r, s, b) => recordServicePostResponse(r, s, b, id),
  },
  {
    name: 'feedback',
    body: { rating: 'GOOD', idempotencyKey: 'key-a' },
    repo: m.feedback,
    capability: true,
    run: (r, s, b) => recordServiceMissionFeedbackResponse(r, s, b, id),
  },
  {
    name: 'business outcome',
    body: outcomes,
    repo: m.getPost,
    run: (r, s, b) => recordServiceBusinessOutcomeResponse(r, s, b, id),
  },
  {
    name: 'goal outcome',
    body: { result: 'SOME_PROGRESS' },
    repo: m.getPost,
    run: (r, s, b) => recordServiceSocialGoalOutcomeResponse(r, s, b, id),
  },
];
const writes = () => [m.decide, m.activity, m.post, m.feedback, m.update, m.milestone, m.usage];
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: 'member-a' });
  m.member.mockResolvedValue(context());
  m.public.mockRejectedValue(new ApplicationError('NOT_FOUND', 'private service'));
  m.list.mockResolvedValue([]);
  m.copy.mockResolvedValue({ allowed: true });
  m.capability.mockResolvedValue({ status: 'ACTIVE' });
  m.decide.mockResolvedValue({
    decision: { id: 'decision-a', decidedAt: new Date(), ...dates },
    activity,
  });
  m.activity.mockResolvedValue(activity);
  m.post.mockResolvedValue({ post, activity });
  m.feedback.mockResolvedValue({ feedback: { id: 'feedback-a', ...dates }, activity });
  m.getPost.mockResolvedValue(post);
  m.snapshot.mockResolvedValue({ payload: { strategy: { goal: 'RECRUIT' } } });
  m.update.mockResolvedValue(post);
  m.milestone.mockResolvedValue([]);
});
describe('private service posting and outcomes', () => {
  it('defaults repeat outcomes for requests from clients deployed before repeat separation', () => {
    expect(
      businessOutcomeSchema.parse({
        inquiries: 1,
        reservations: 2,
        visits: 3,
        orders: 0,
        other: 0,
      }),
    ).toEqual({
      inquiries: 1,
      reservations: 2,
      visits: 3,
      repeatReservations: 0,
      repeatVisits: 0,
      orders: 0,
      other: 0,
    });
  });

  it.each(operations)('allows $name with the authenticated member scope', async (op) => {
    expect((await op.run(request(op.body), 'private-a', 'bunshin-a')).status).toBe(200);
    expect(m.member).toHaveBeenCalledWith('private-a', 'member-a');
    expect(m.member).toHaveBeenCalledOnce();
    expect(m.actor.mock.invocationCallOrder[0]).toBeLessThan(m.member.mock.invocationCallOrder[0]!);
    expect(m.public).not.toHaveBeenCalled();
    expect(op.repo).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        actorUserId: 'member-a',
        bunshinId: 'bunshin-a',
      }),
    );
  });
  it.each(operations)('rejects anonymous $name before service resolution', async (op) => {
    m.actor.mockResolvedValue(null);
    expect((await op.run(request(op.body), 'private-a', 'bunshin-a')).status).toBe(401);
    expect(m.member).not.toHaveBeenCalled();
    expect(op.repo).not.toHaveBeenCalled();
    for (const fn of writes()) expect(fn).not.toHaveBeenCalled();
  });
  it.each(operations)(
    'rejects $name when membership or service availability is denied',
    async (op) => {
      m.member.mockRejectedValue(new ApplicationError('NOT_FOUND', 'service not found'));
      expect((await op.run(request(op.body), 'other', 'bunshin-a')).status).toBe(404);
      expect(op.repo).not.toHaveBeenCalled();
      for (const fn of writes()) expect(fn).not.toHaveBeenCalled();
    },
  );
  it.each(operations)('does not reuse another project scope for $name', async (op) => {
    m.member.mockResolvedValue(context('service-b', 'workspace-b'));
    expect((await op.run(request(op.body), 'private-b', 'bunshin-b')).status).toBe(200);
    expect(op.repo).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-b',
        groupId: 'service-b',
        actorUserId: 'member-a',
        bunshinId: 'bunshin-b',
      }),
    );
  });
  it.each(operations.filter((op) => !op.read))('rejects cross-origin $name', async (op) => {
    expect(
      (await op.run(request(op.body, 'https://attacker.example'), 'private-a', 'bunshin-a')).status,
    ).toBe(403);
    expect(m.member).not.toHaveBeenCalled();
    for (const fn of writes()) expect(fn).not.toHaveBeenCalled();
  });
  it.each(operations.filter((op) => !op.read))('rejects scope injection into $name', async (op) => {
    for (const key of ['workspaceId', 'groupId', 'actorUserId', 'bunshinId'])
      expect(
        (await op.run(request({ ...op.body, [key]: 'other' }), 'private-a', 'bunshin-a')).status,
      ).toBe(400);
    for (const fn of writes()) expect(fn).not.toHaveBeenCalled();
  });
  it.each(operations.filter((op) => op.capability))(
    'requires active SOCIAL for $name',
    async (op) => {
      m.capability.mockResolvedValue({ status: 'SUSPENDED' });
      expect((await op.run(request(op.body), 'private-a', 'bunshin-a')).status).toBe(403);
      for (const fn of writes()) expect(fn).not.toHaveBeenCalled();
    },
  );
  it.each(operations)('preserves owner/mission denial from repositories for $name', async (op) => {
    op.repo.mockResolvedValue(null);
    expect((await op.run(request(op.body), 'private-a', 'foreign-bunshin')).status).toBe(
      op.name === 'business outcome' || op.name === 'goal outcome' ? 409 : 404,
    );
    expect(m.update).not.toHaveBeenCalled();
    expect(m.milestone).not.toHaveBeenCalled();
    expect(m.usage).not.toHaveBeenCalled();
  });
  it('retains service-specific business outcome settings', async () => {
    m.member.mockResolvedValue(context('sennokuni', 'workspace-a', false));
    expect(
      (await recordServiceBusinessOutcomeResponse(request(outcomes), 'sennokuni', 'bunshin-a', id))
        .status,
    ).toBe(403);
    expect(m.getPost).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
  it('records goal progress against the server-side generation goal', async () => {
    const response = await recordServiceSocialGoalOutcomeResponse(
      request({ result: 'ACHIEVED' }),
      'private-a',
      'bunshin-a',
      id,
    );
    expect(response.status).toBe(200);
    expect(m.snapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        actorUserId: 'member-a',
        bunshinId: 'bunshin-a',
        dailyMissionId: id,
      }),
    );
    expect(m.update).toHaveBeenCalledWith({
      where: { id: 'post-a' },
      data: {
        manualMetrics: expect.objectContaining({
          existing: 1,
          socialGoalOutcome: expect.objectContaining({
            strategyGoal: 'RECRUIT',
            result: 'ACHIEVED',
          }),
        }),
      },
    });
  });
  it('does not accept goal progress when the generation goal is unavailable', async () => {
    m.snapshot.mockResolvedValue({ payload: { strategy: { id: 'strategy-a' } } });
    expect(
      (
        await recordServiceSocialGoalOutcomeResponse(
          request({ result: 'ACHIEVED' }),
          'private-a',
          'bunshin-a',
          id,
        )
      ).status,
    ).toBe(409);
    expect(m.update).not.toHaveBeenCalled();
  });
  it('keeps milestone and usage attribution inside the service', async () => {
    await recordServicePostResponse(
      request({ platform: 'X', idempotencyKey: 'key-a' }),
      'private-a',
      'bunshin-a',
      id,
    );
    expect(m.milestone).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        referredUserId: 'member-a',
        milestone: 'FIRST_POST_REPORTED',
      }),
    );
    await decideServiceDailyMissionResponse(
      request({ decision: 'ACCEPTED', idempotencyKey: 'key-a' }),
      'private-a',
      'bunshin-a',
      id,
    );
    expect(m.usage).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'service-a',
        userId: 'member-a',
        idempotencyKey: 'CONTENT_APPROVE:key-a',
      }),
    );
  });
  it('keeps the generation/variant shared scope member-authorized without additional fields', async () => {
    expect(await serviceDailyMissionScope('private-a', 'bunshin-a')).toEqual({
      workspaceId: 'workspace-a',
      groupId: 'service-a',
      actorUserId: 'member-a',
      bunshinId: 'bunshin-a',
    });
  });
});
