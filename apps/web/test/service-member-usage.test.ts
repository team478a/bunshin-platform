import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberUsageSources } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  member: vi.fn(),
  membership: vi.fn(),
  bunshin: vi.fn(),
  authorize: vi.fn(),
  read: vi.fn(),
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
  PrismaMemberUsageRepository: class {
    authorize = m.authorize;
    read = m.read;
  },
}));
import { getServiceMemberUsageResponse } from '../src/http/service-member-usage';
import {
  GET,
  dynamic,
  runtime,
} from '../app/api/services/[serviceSlug]/bunshins/[bunshinId]/member-usage/route';

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
const request = (query = '') =>
  new Request(
    `https://example.com/api/services/hassy/bunshins/${scope.bunshinId}/member-usage${query}`,
    {
      headers: { 'x-request-id': 'request-usage-1' },
    },
  );
const run = (query = '') => getServiceMemberUsageResponse(request(query), 'hassy', scope.bunshinId);
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  m.actor.mockResolvedValue({ userId: scope.userId });
  m.member.mockResolvedValue({ workspaceId: scope.workspaceId, serviceId: scope.serviceId });
  m.membership.mockResolvedValue({ id: scope.groupMembershipId });
  m.bunshin.mockResolvedValue({ id: scope.bunshinId, lineNotificationPreferences: [] });
  m.authorize.mockResolvedValue(true);
  m.read.mockResolvedValue(source());
  m.reserve.mockReturnValue({ allowed: true, release: m.release });
});
afterEach(() => vi.useRealTimers());

describe('member usage authenticated API', () => {
  it('connects the real use case to the GET route with server scope/time and a minimal private DTO', async () => {
    expect(runtime).toBe('nodejs');
    expect(dynamic).toBe('force-dynamic');
    const response = await GET(request(), {
      params: Promise.resolve({ serviceSlug: 'hassy', bunshinId: scope.bunshinId }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie, Authorization');
    const body = (await response.json()) as { data: Record<string, unknown>; requestId: string };
    expect(body).toMatchObject({
      requestId: 'request-usage-1',
      data: {
        version: 'member-usage-api-v1',
        asOf: now.toISOString(),
        timezone: 'Asia/Tokyo',
        allTime: { generated: 1, activeDays: 1, selfReportedPosts: 0 },
        last7Days: { fromLocalDate: '2026-10-27', throughLocalDate: '2026-11-02' },
        last30Days: { fromLocalDate: '2026-10-04', throughLocalDate: '2026-11-02' },
      },
    });
    const json = JSON.stringify(body);
    for (const privateValue of [
      ...Object.values(scope),
      'aiCost',
      'knownUsdMicros',
      '123456789',
      'scope',
      'actorUserId',
    ])
      expect(json).not.toContain(privateValue);
    expect(m.authorize).toHaveBeenCalledWith({
      actorUserId: scope.userId,
      scope,
      asOf: now,
      timezone: 'Asia/Tokyo',
    });
    expect(m.read).toHaveBeenCalledWith({
      actorUserId: scope.userId,
      scope,
      asOf: now,
      timezone: 'Asia/Tokyo',
    });
    expect(m.authorize.mock.invocationCallOrder[0]).toBeLessThan(
      m.read.mock.invocationCallOrder[0]!,
    );
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
        last7Days: { fromLocalDate: '2026-10-26', throughLocalDate: '2026-11-01' },
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
    expect((await getServiceMemberUsageResponse(request(), 'hassy', 'not-a-uuid')).status).toBe(
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

  it.each(['authorize', 'read'] as const)(
    'preserves revocation/consent denial during %s without admin override',
    async (key) => {
      if (key === 'authorize') m.authorize.mockResolvedValue(false);
      else m.read.mockResolvedValue(null);
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
      data: { allTime: { generated: 0, activeDays: 0, lastActiveAt: null } },
    });
  });
});
