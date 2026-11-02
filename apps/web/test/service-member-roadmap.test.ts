import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberRoadmap, MemberRoadmapContext, MemberUsageSources } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { createHassyMemberRoadmapDefinition as createDefaultMemberRoadmapDefinition } from '../src/services/hassy-growth-policy';
import type * as ReadLimitModule from '../src/http/member-usage-read-limit';

type RoadmapBody = {
  requestId: string;
  data: Omit<MemberRoadmap, 'scope' | 'version'> & { version: 'member-roadmap-api-v1' };
};

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  member: vi.fn(),
  membership: vi.fn(),
  bunshin: vi.fn(),
  authorize: vi.fn(),
  read: vi.fn(),
  context: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: m.member }));
vi.mock('../src/http/member-usage-read-limit', () => ({
  memberUsageReadLimit: { reserve: m.reserve },
}));
vi.mock('@bunshin/database', () => ({
  prisma: { groupMembership: { findFirst: m.membership }, bunshin: { findFirst: m.bunshin } },
  PrismaMemberRoadmapContextRepository: class {
    read = m.context;
  },
  PrismaMemberUsageRepository: class {
    authorize = m.authorize;
    read = m.read;
  },
}));
import { getServiceMemberRoadmapResponse } from '../src/http/service-member-roadmap';
import { getServiceMemberUsageResponse } from '../src/http/service-member-usage';
import { getServiceMemberGrowthResponse } from '../src/http/service-member-growth';
import {
  GET as growthGET,
  dynamic as growthDynamic,
  runtime as growthRuntime,
} from '../app/api/services/[serviceSlug]/bunshins/[bunshinId]/member-growth/route';
import {
  GET,
  dynamic,
  runtime,
} from '../app/api/services/[serviceSlug]/bunshins/[bunshinId]/member-roadmap/route';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const now = new Date('2026-11-01T15:00:00Z');
const scope = {
  workspaceId: id(1),
  serviceId: id(2),
  groupMembershipId: id(3),
  userId: id(4),
  bunshinId: id(5),
};
const source = (): MemberUsageSources => ({
  scope: { ...scope },
  completeness: 'COMPLETE',
  generations: [
    { id: 'generation', scope: { ...scope }, occurredAt: now, status: 'SUCCESS', trigger: 'USER' },
  ],
  activities: [],
  decisions: [],
  postRecords: [],
  aiUsage: [
    { id: 'cost', scope: { ...scope }, occurredAt: now, estimatedCostUsdMicros: 123456789n },
  ],
});
const context = (): MemberRoadmapContext => ({
  scope: { ...scope },
  asOf: now.toISOString(),
  timezone: 'Asia/Tokyo',
  definition: createDefaultMemberRoadmapDefinition(),
  facts: { INITIAL_SETUP: true },
  features: {
    FIRST_DECISION: {
      implemented: true,
      enabled: true,
      budgetAllowed: true,
      readyForRecommendation: true,
      access: { allowed: true, reason: 'ALLOWED', dailyLimit: null, monthlyLimit: null },
    },
  },
  validReferrals: null,
});
const request = (query = '') =>
  new Request(
    `https://example.com/api/services/hassy/bunshins/${scope.bunshinId}/member-roadmap${query}`,
    {
      headers: { 'x-request-id': 'request-usage-1' },
    },
  );
const run = (query = '') =>
  getServiceMemberRoadmapResponse(request(query), 'hassy', scope.bunshinId);
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  m.actor.mockResolvedValue({ userId: scope.userId });
  m.member.mockResolvedValue({
    workspaceId: scope.workspaceId,
    serviceId: scope.serviceId,
    configuration: {
      id: id(6),
      workspaceId: scope.workspaceId,
      groupId: scope.serviceId,
      registration: { onboardingConfig: { templateKey: 'HASSY' } },
    },
  });
  m.membership.mockResolvedValue({ id: scope.groupMembershipId });
  m.bunshin.mockResolvedValue({ id: scope.bunshinId, lineNotificationPreferences: [] });
  m.authorize.mockResolvedValue(true);
  m.read.mockResolvedValue(source());
  m.context.mockImplementation((input: { timezone: string }) =>
    Promise.resolve({ ...context(), timezone: input.timezone }),
  );
  m.reserve.mockReturnValue({ allowed: true, release: m.release });
});
afterEach(() => vi.useRealTimers());

const runGrowth = (query = '') =>
  getServiceMemberGrowthResponse(request(query), 'hassy', scope.bunshinId);

describe('single-read member growth API', () => {
  it.each([
    ['Asia/Tokyo', '2026-11-01T14:59:59Z', '2026-11-01T15:00:00Z', 2],
    ['America/Los_Angeles', '2026-11-01T08:30:00Z', '2026-11-01T09:30:00Z', 1],
  ])(
    'preserves actual local activity days at midnight/DST in %s',
    async (timezone, first, last, days) => {
      const asOf = new Date(last);
      vi.setSystemTime(asOf);
      m.bunshin.mockResolvedValue({
        id: scope.bunshinId,
        lineNotificationPreferences: [{ timezone }],
      });
      m.context.mockResolvedValue({ ...context(), asOf: asOf.toISOString(), timezone });
      const value = source();
      value.generations = [first, last].map((date, index) => ({
        id: `generation-${index}`,
        scope: { ...scope },
        occurredAt: new Date(date),
        status: 'SUCCESS' as const,
        trigger: 'USER' as const,
      }));
      value.aiUsage = [];
      m.read.mockResolvedValue(value);
      const response = await runGrowth();
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: {
          usage: {
            asOf: asOf.toISOString(),
            timezone,
            allTime: { generated: 2, activeDays: days },
            last7Days: { activeDays: days },
            last30Days: { activeDays: days },
          },
          roadmap: { asOf: asOf.toISOString(), timezone },
        },
      });
      expect(m.read).toHaveBeenCalledOnce();
    },
  );
  it('returns both existing DTOs with one usage read, one context read and one guard reservation', async () => {
    expect(growthRuntime).toBe('nodejs');
    expect(growthDynamic).toBe('force-dynamic');
    const response = await growthGET(request(), {
      params: Promise.resolve({ serviceSlug: 'hassy', bunshinId: scope.bunshinId }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie, Authorization');
    const body = (await response.json()) as {
      requestId: string;
      data: { version: string; roadmap: unknown; usage: unknown };
    };
    expect(body).toMatchObject({
      requestId: 'request-usage-1',
      data: {
        version: 'member-growth-api-v1',
        roadmap: {
          version: 'member-roadmap-api-v1',
          asOf: now.toISOString(),
          timezone: 'Asia/Tokyo',
        },
        usage: {
          version: 'member-usage-api-v1',
          asOf: now.toISOString(),
          timezone: 'Asia/Tokyo',
          allTime: { generated: 1, activeDays: 1 },
        },
      },
    });
    expect(Object.keys(body.data).sort()).toEqual(['roadmap', 'usage', 'version']);
    expect(m.authorize).toHaveBeenCalledOnce();
    expect(m.read).toHaveBeenCalledOnce();
    expect(m.context).toHaveBeenCalledOnce();
    expect(m.reserve).toHaveBeenCalledOnce();
    expect(m.release).toHaveBeenCalledOnce();
    expect(m.read.mock.calls[0]).toEqual(m.context.mock.calls[0]);
    for (const privateValue of [
      ...Object.values(scope),
      'scope',
      'aiCost',
      '123456789',
      'features',
      'facts',
      'actorUserId',
    ])
      expect(JSON.stringify(body)).not.toContain(privateValue);
    // Existing contracts remain exact projections, not silently extended v1 responses.
    expect(body.data.roadmap).toEqual((await (await run()).json()).data);
    expect(body.data.usage).toEqual(
      (await (await getServiceMemberUsageResponse(request(), 'hassy', scope.bunshinId)).json())
        .data,
    );
  });

  it.each(['CUSTOM', 'MANABERU_STYLE', null])(
    'does not select Hassy for %s',
    async (templateKey) => {
      const service = await m.member();
      service.configuration.registration.onboardingConfig.templateKey = templateKey;
      m.member.mockResolvedValue(service);
      expect((await runGrowth()).status).toBe(404);
      expect(m.read).not.toHaveBeenCalled();
      expect(m.context).not.toHaveBeenCalled();
    },
  );

  it('requires authentication before reserving or resolving a service', async () => {
    m.actor.mockResolvedValue(null);
    expect((await runGrowth()).status).toBe(401);
    expect(m.reserve).not.toHaveBeenCalled();
    expect(m.member).not.toHaveBeenCalled();
  });

  it.each([
    'workspaceId',
    'serviceId',
    'userId',
    'bunshinId',
    'groupMembershipId',
    'asOf',
    'timezone',
    'limit',
  ])('rejects injected %s', async (key) => {
    expect((await runGrowth(`?${key}=override`)).status).toBe(400);
    expect(m.member).not.toHaveBeenCalled();
    expect(m.read).not.toHaveBeenCalled();
  });

  it.each(['membership', 'bunshin', 'authorize', 'read', 'context'] as const)(
    'fails closed for revoked/missing %s without partial data',
    async (key) => {
      m[key].mockResolvedValue(key === 'authorize' ? false : null);
      const response = await runGrowth();
      expect(response.status).toBe(404);
      expect(await response.json()).not.toHaveProperty('data');
      expect(m.release).toHaveBeenCalledOnce();
    },
  );

  it.each(['workspaceId', 'serviceId', 'groupMembershipId', 'userId', 'bunshinId'] as const)(
    'rejects foreign evidence in %s',
    async (key) => {
      m.context.mockResolvedValue({ ...context(), scope: { ...scope, [key]: id(99) } });
      const response = await runGrowth();
      expect(response.status).toBe(503);
      expect(await response.json()).not.toHaveProperty('data');
      expect(m.release).toHaveBeenCalledOnce();
    },
  );

  it.each(['asOf', 'timezone'] as const)('rejects inconsistent context %s', async (key) => {
    m.context.mockResolvedValue({
      ...context(),
      [key]: key === 'asOf' ? '2026-10-31T00:00:00Z' : 'UTC',
    });
    const response = await runGrowth();
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('data');
  });

  it.each(['denied', 'stopped', 'budget', 'unresolved'] as const)(
    'does not recommend a %s feature',
    async (state) => {
      const value = context();
      if (state === 'denied')
        value.features.FIRST_DECISION!.access = {
          ...value.features.FIRST_DECISION!.access,
          allowed: false,
          reason: 'MEMBER_NOT_ALLOWED',
        };
      if (state === 'stopped') value.features.FIRST_DECISION!.enabled = false;
      if (state === 'budget') value.features.FIRST_DECISION!.budgetAllowed = false;
      if (state === 'unresolved') delete value.features.FIRST_DECISION;
      m.context.mockResolvedValue(value);
      expect(await (await runGrowth()).json()).toMatchObject({
        data: { roadmap: { nextRecommended: null } },
      });
    },
  );

  it('keeps legacy unknown-trigger generations without inventing activity', async () => {
    const value = source();
    value.generations[0]!.trigger = 'UNKNOWN';
    m.read.mockResolvedValue(value);
    expect(await (await runGrowth()).json()).toMatchObject({
      data: {
        usage: { allTime: { unknownTriggerGenerations: 1, activeDays: 0 } },
        roadmap: {
          stages: [{ milestones: [{}, { achievement: 'COMPLETED' }, {}] }, {}, {}, {}, {}],
        },
      },
    });
  });

  it.each(['read', 'context'] as const)('redacts %s failure and releases capacity', async (key) => {
    m[key].mockRejectedValue(new Error('secret database information'));
    const response = await runGrowth();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).not.toHaveProperty('data');
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(m.release).toHaveBeenCalledOnce();
  });

  it('shares the real rate window with both existing endpoints', async () => {
    const { MemberUsageReadLimit } = await vi.importActual<typeof ReadLimitModule>(
      '../src/http/member-usage-read-limit',
    );
    const guard = new MemberUsageReadLimit(2);
    m.reserve.mockImplementation((userId: string) => guard.reserve(userId));
    expect((await runGrowth()).status).toBe(200);
    expect((await run()).status).toBe(200);
    const response = await getServiceMemberUsageResponse(request(), 'hassy', scope.bunshinId);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(m.read).toHaveBeenCalledTimes(2);
  });
});

describe('member roadmap authenticated API', () => {
  it.each(['CUSTOM', 'MANABERU_STYLE', null])(
    'does not read usage or return a Hassy roadmap for template %s',
    async (templateKey) => {
      m.member.mockResolvedValue({
        workspaceId: scope.workspaceId,
        serviceId: scope.serviceId,
        configuration: {
          id: id(6),
          workspaceId: scope.workspaceId,
          groupId: scope.serviceId,
          slug: 'hassy',
          displayName: 'ハッシー',
          registration: { onboardingConfig: { templateKey } },
        },
      });
      const response = await run();
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(m.authorize).not.toHaveBeenCalled();
      expect(m.context).not.toHaveBeenCalled();
      expect(m.release).toHaveBeenCalledOnce();
      // Product selection applies only to the roadmap, never to basic usage access.
      expect(
        (await getServiceMemberUsageResponse(request(), 'hassy', scope.bunshinId)).status,
      ).toBe(200);
    },
  );

  it('does not trust a product definition returned by the evidence adapter', async () => {
    const value = context();
    value.definition.version = 'untrusted-evidence-definition';
    value.definition.stages = [];
    m.context.mockResolvedValue(value);
    expect(await (await run()).json()).toMatchObject({
      data: { definitionVersion: 'hassy-roadmap-v1' },
    });
  });

  it('shares the real per-user request window with the usage endpoint', async () => {
    const { MemberUsageReadLimit } = await vi.importActual<typeof ReadLimitModule>(
      '../src/http/member-usage-read-limit',
    );
    const guard = new MemberUsageReadLimit(2);
    m.reserve.mockImplementation((userId: string) => guard.reserve(userId));
    expect((await getServiceMemberUsageResponse(request(), 'hassy', scope.bunshinId)).status).toBe(
      200,
    );
    expect((await run()).status).toBe(200);
    const response = await getServiceMemberUsageResponse(request(), 'hassy', scope.bunshinId);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(m.read).toHaveBeenCalledTimes(2);
    expect(m.context).toHaveBeenCalledOnce();
  });

  it('shares the concurrent slot and releases it after context failure', async () => {
    const { MemberUsageReadLimit } = await vi.importActual<typeof ReadLimitModule>(
      '../src/http/member-usage-read-limit',
    );
    const guard = new MemberUsageReadLimit();
    m.reserve.mockImplementation((userId: string) => guard.reserve(userId));
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let fail!: () => void;
    m.context.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = () => reject(new Error('private failure'));
          entered();
        }),
    );
    const pending = run();
    await started;
    expect((await getServiceMemberUsageResponse(request(), 'hassy', scope.bunshinId)).status).toBe(
      429,
    );
    fail();
    expect((await pending).status).toBe(500);
    expect((await getServiceMemberUsageResponse(request(), 'hassy', scope.bunshinId)).status).toBe(
      200,
    );
  });

  it('connects real usage and roadmap use cases through GET and allowlists the public DTO', async () => {
    expect(runtime).toBe('nodejs');
    expect(dynamic).toBe('force-dynamic');
    const response = await GET(request(), {
      params: Promise.resolve({ serviceSlug: 'hassy', bunshinId: scope.bunshinId }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie, Authorization');
    const body = (await response.json()) as RoadmapBody;
    expect(body).toMatchObject({
      requestId: 'request-usage-1',
      data: {
        version: 'member-roadmap-api-v1',
        definitionVersion: 'hassy-roadmap-v1',
        asOf: now.toISOString(),
        timezone: 'Asia/Tokyo',
        currentStageId: 'STEP_1',
        nextRecommended: { stageId: 'STEP_1', milestoneId: 'FIRST_DECISION' },
        stages: [
          {
            id: 'STEP_1',
            status: 'AVAILABLE',
            progress: { completed: 2, total: 3, unknown: 0 },
            milestones: [
              { id: 'INITIAL_SETUP', achievement: 'COMPLETED' },
              { id: 'FIRST_GENERATION', progress: { current: 1, target: 1 } },
              { id: 'FIRST_DECISION', status: 'AVAILABLE', reason: 'ACTION_AVAILABLE' },
            ],
          },
          {},
          {},
          {},
          {},
        ],
      },
    });
    expect(Object.keys(body.data).sort()).toEqual(
      [
        'version',
        'definitionVersion',
        'validReferrals',
        'asOf',
        'timezone',
        'currentStageId',
        'nextRecommended',
        'stages',
      ].sort(),
    );
    for (const stage of body.data.stages) {
      expect(Object.keys(stage).sort()).toEqual(
        ['id', 'title', 'status', 'progress', 'milestones'].sort(),
      );
      for (const item of stage.milestones)
        expect(Object.keys(item).sort()).toEqual(
          ['id', 'title', 'status', 'reason', 'achievement', 'availability', 'progress'].sort(),
        );
    }
    const json = JSON.stringify(body);
    for (const privateValue of [
      ...Object.values(scope),
      'scope',
      'aiCost',
      '123456789',
      'access',
      'dailyLimit',
      'features',
      'facts',
      'actorUserId',
    ])
      expect(json).not.toContain(privateValue);
    const input = { actorUserId: scope.userId, scope, asOf: now, timezone: 'Asia/Tokyo' };
    expect(m.authorize).toHaveBeenCalledWith(input);
    expect(m.read).toHaveBeenCalledWith(input);
    expect(m.context).toHaveBeenCalledWith(input);
    expect(m.read.mock.invocationCallOrder[0]).toBeLessThan(m.context.mock.invocationCallOrder[0]!);
    expect(m.release).toHaveBeenCalledOnce();
  });

  it('scopes all context reads to the verified owner and selected service', async () => {
    await run();
    expect(m.member).toHaveBeenCalledWith('hassy', scope.userId);
    expect(m.reserve).toHaveBeenCalledWith(scope.userId);
    expect(m.membership).toHaveBeenCalledWith({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.serviceId,
        userId: scope.userId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    expect(m.bunshin).toHaveBeenCalledWith({
      where: {
        id: scope.bunshinId,
        workspaceId: scope.workspaceId,
        groupId: scope.serviceId,
        ownerUserId: scope.userId,
        status: { not: 'ARCHIVED' },
      },
      select: {
        id: true,
        lineNotificationPreferences: {
          where: { workspaceId: scope.workspaceId, userId: scope.userId },
          select: { timezone: true },
          take: 1,
        },
      },
    });
  });

  it('uses the stored timezone even when notifications are disabled', async () => {
    m.bunshin.mockResolvedValue({
      id: scope.bunshinId,
      lineNotificationPreferences: [{ timezone: 'America/Los_Angeles' }],
    });
    const response = await run();
    expect(await response.json()).toMatchObject({
      data: {
        timezone: 'America/Los_Angeles',
        asOf: now.toISOString(),
      },
    });
    expect(m.read.mock.calls[0]?.[0]).toMatchObject({ timezone: 'America/Los_Angeles' });
  });

  it('requires authentication before service or usage access', async () => {
    m.actor.mockResolvedValue(null);
    const response = await run();
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(m.reserve).not.toHaveBeenCalled();
    expect(m.member).not.toHaveBeenCalled();
    expect(m.read).not.toHaveBeenCalled();
  });

  it.each([
    'workspaceId',
    'serviceId',
    'groupMembershipId',
    'userId',
    'bunshinId',
    'asOf',
    'timezone',
    'limit',
  ])('rejects query injection through %s', async (key) => {
    expect((await run(`?${key}=override`)).status).toBe(400);
    expect(m.member).not.toHaveBeenCalled();
    expect(m.authorize).not.toHaveBeenCalled();
  });

  it('rejects an invalid Bunshin ID before querying', async () => {
    expect((await getServiceMemberRoadmapResponse(request(), 'hassy', 'not-a-uuid')).status).toBe(
      400,
    );
    expect(m.member).not.toHaveBeenCalled();
  });

  it.each(['membership', 'bunshin'] as const)(
    'returns 404 for missing/foreign %s without reading events',
    async (key) => {
      m[key].mockResolvedValue(null);
      expect((await run()).status).toBe(404);
      expect(m.authorize).not.toHaveBeenCalled();
      expect(m.read).not.toHaveBeenCalled();
      expect(m.release).toHaveBeenCalledOnce();
    },
  );

  it('stops when service membership resolution denies access', async () => {
    m.member.mockRejectedValue(new ApplicationError('NOT_FOUND', 'foreign service'));
    expect((await run()).status).toBe(404);
    expect(m.membership).not.toHaveBeenCalled();
    expect(m.read).not.toHaveBeenCalled();
    expect(m.release).toHaveBeenCalledOnce();
  });

  it.each(['authorize', 'read', 'context'] as const)(
    'preserves revocation/consent denial during %s without admin override',
    async (key) => {
      if (key === 'authorize') m.authorize.mockResolvedValue(false);
      else m[key].mockResolvedValue(null);
      expect((await run()).status).toBe(404);
      if (key === 'authorize') expect(m.read).not.toHaveBeenCalled();
      expect(m.release).toHaveBeenCalledOnce();
    },
  );

  it.each(['', 'not/a/timezone'])(
    'rejects corrupt stored timezone %s instead of inventing a date boundary',
    async (timezone) => {
      m.bunshin.mockResolvedValue({
        id: scope.bunshinId,
        lineNotificationPreferences: [{ timezone }],
      });
      expect((await run()).status).toBe(503);
      expect(m.read).not.toHaveBeenCalled();
      expect(m.release).toHaveBeenCalledOnce();
    },
  );

  it.each(['partial', 'foreign-source'] as const)(
    'fails closed for %s and releases the slot',
    async (reason) => {
      const data = source();
      if (reason === 'partial') data.completeness = 'PARTIAL';
      else data.generations = [{ ...data.generations[0]!, scope: { ...scope, bunshinId: id(99) } }];
      m.read.mockResolvedValue(data);
      const response = await run();
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
      expect(m.release).toHaveBeenCalledOnce();
    },
  );

  it('returns 429 with Retry-After before expensive context/source reads', async () => {
    m.reserve.mockReturnValue({ allowed: false, retryAfterSeconds: 12 });
    const response = await run();
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('12');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(m.member).not.toHaveBeenCalled();
    expect(m.read).not.toHaveBeenCalled();
    expect(m.release).not.toHaveBeenCalled();
  });

  it('redacts unexpected DB failures and always releases capacity', async () => {
    m.read.mockRejectedValue(new Error('secret connection string and private data'));
    const response = await run();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('secret');
    expect(m.release).toHaveBeenCalledOnce();
  });

  it('keeps empty legacy sources usable without synthesizing activity', async () => {
    m.read.mockResolvedValue({ ...source(), generations: [], aiUsage: [] });
    expect(await (await run()).json()).toMatchObject({
      data: {
        stages: [
          {
            milestones: [
              {},
              { id: 'FIRST_GENERATION', achievement: 'INCOMPLETE', progress: { current: 0 } },
              {},
            ],
          },
          { milestones: [{}, {}, { id: 'CONTINUED_ACTIVITY', progress: { current: 0 } }] },
          {},
          {},
          {},
        ],
      },
    });
  });
  it.each(['scope', 'asOf', 'timezone'] as const)(
    'rejects mismatched context %s as unavailable',
    async (key) => {
      const value = context();
      if (key === 'scope') value.scope = { ...scope, serviceId: id(99) };
      if (key === 'asOf') value.asOf = new Date(now.getTime() - 1).toISOString();
      if (key === 'timezone') value.timezone = 'UTC';
      m.context.mockResolvedValue(value);
      const response = await run();
      expect(response.status).toBe(503);
      expect(response.headers.get('vary')).toBe('Cookie, Authorization');
      expect(await response.json()).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
      expect(m.release).toHaveBeenCalledOnce();
    },
  );

  it.each(['denied', 'stopped', 'budget', 'not-ready', 'unresolved'] as const)(
    'never recommends a %s feature',
    async (state) => {
      const value = context();
      const feature = value.features.FIRST_DECISION!;
      if (state === 'denied')
        feature.access = { ...feature.access, allowed: false, reason: 'MEMBER_NOT_ALLOWED' };
      if (state === 'stopped') feature.enabled = false;
      if (state === 'budget') feature.budgetAllowed = false;
      if (state === 'not-ready') feature.readyForRecommendation = false;
      if (state === 'unresolved') delete value.features.FIRST_DECISION;
      m.context.mockResolvedValue(value);
      expect(await (await run()).json()).toMatchObject({ data: { nextRecommended: null } });
    },
  );

  it('preserves unknown evidence and completed progress independently of current permission', async () => {
    const value = context();
    value.features = {};
    m.context.mockResolvedValue(value);
    const body = (await (await run()).json()) as RoadmapBody;
    expect(body.data.nextRecommended).toBeNull();
    expect(body.data.stages[0]!.milestones[1]).toMatchObject({
      achievement: 'COMPLETED',
      status: 'COMPLETED',
      availability: { state: 'PREPARING', reason: 'NOT_RESOLVED' },
    });
    expect(body.data.stages[1]!.milestones[0]).toMatchObject({
      achievement: 'UNKNOWN',
      status: 'PREPARING',
      progress: { current: null },
    });
  });

  it('redacts a context adapter failure and releases capacity', async () => {
    m.context.mockRejectedValue(new Error('private policy and connection'));
    const response = await run();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('private policy');
    expect(m.release).toHaveBeenCalledOnce();
  });
});
