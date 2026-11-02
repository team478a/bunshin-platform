import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.test' }),
}));
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  target: vi.fn(),
  overview: vi.fn(),
  save: vi.fn(),
  execute: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: async () => ({ getCurrentUser: m.actor }),
}));
vi.mock('../src/http/member-usage-read-limit', () => ({
  memberUsageReadLimit: { reserve: m.reserve },
}));
vi.mock('@bunshin/database', () => ({
  prisma: { serviceConfiguration: { findUnique: m.target } },
  PrismaServiceReferralManagementRepository: class {
    overview = m.overview;
    savePolicy = m.save;
    execute = m.execute;
  },
}));
import { GET, POST } from '../app/api/services/[serviceSlug]/referral-management/route';
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const context = { params: Promise.resolve({ serviceSlug: 'synthetic' }) };
const review = () => ({
  kind: 'REVIEW',
  commandId: id(1),
  referralId: id(2),
  expectedRevision: 0,
  review: 'CLEAR',
  reason: 'Synthetic check',
});
const request = (body: unknown, origin = 'https://example.test') =>
  new Request('https://example.test/api/services/synthetic/referral-management', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: id(3) });
  m.target.mockResolvedValue({ workspaceId: id(4), groupId: id(5) });
  m.reserve.mockReturnValue({ allowed: true, release: m.release });
  m.overview.mockResolvedValue({ referrals: [], hasMore: false, policy: null });
  m.execute.mockResolvedValue({ state: 'UNASSESSED', review: 'CLEAR' });
});
describe('referral management HTTP authorization and input boundary', () => {
  it('requires session and does not read service before authentication', async () => {
    m.actor.mockResolvedValue(null);
    expect((await POST(request(review()), context)).status).toBe(401);
    expect(m.target).not.toHaveBeenCalled();
  });
  it('passes only server-resolved scope and explicit command to the authorized repository', async () => {
    const response = await POST(request(review()), context);
    expect(response.status).toBe(200);
    expect(m.execute).toHaveBeenCalledWith(
      { workspaceId: id(4), serviceId: id(5), actorUserId: id(3) },
      review(),
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie, Authorization');
    expect(m.release).toHaveBeenCalledOnce();
  });
  it.each([
    { ...review(), workspaceId: id(9) },
    { ...review(), proof: { decision: 'QUALIFIED' } },
    { ...review(), review: 'AUTOMATIC_CLEAR' },
    { ...review(), reason: '' },
    { ...review(), expectedRevision: -1 },
  ])('rejects forged scope, proof and invalid commands', async (value) => {
    expect((await POST(request(value), context)).status).toBe(400);
    expect(m.execute).not.toHaveBeenCalled();
  });
  it('rejects cross-origin writes before resolving a target', async () => {
    expect((await POST(request(review(), 'https://other.test'), context)).status).toBe(403);
    expect(m.target).not.toHaveBeenCalled();
    expect(m.release).toHaveBeenCalledOnce();
  });
  it('maps DB permission denial without leaking identities or raw errors', async () => {
    m.overview.mockRejectedValue(new ApplicationError('FORBIDDEN', 'secret identity'));
    const response = await GET(
      new Request('https://example.test/api/services/synthetic/referral-management'),
      context,
    );
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('secret identity');
    expect(m.release).toHaveBeenCalledOnce();
  });
  it('rejects client-generated result, unknown profile keys and malformed policy', async () => {
    const body = {
      kind: 'POLICY',
      expectedPolicyVersionId: null,
      authority: 'SERVICE',
      status: 'ACTIVE',
      timezone: 'Asia/Tokyo',
      reason: 'Synthetic',
      conditions: {
        requireNewRegistration: true,
        requireOnboarding: false,
        requireFirstUserGeneration: false,
        minimumActiveDays: 0,
        executeSql: 'x',
      },
    };
    expect((await POST(request(body), context)).status).toBe(400);
    expect(m.save).not.toHaveBeenCalled();
  });
  it('rate limits before DB work', async () => {
    m.reserve.mockReturnValue({ allowed: false, retryAfterSeconds: 20 });
    const response = await POST(request(review()), context);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('20');
    expect(m.target).not.toHaveBeenCalled();
  });
  it('only accepts a single valid cursor for reads', async () => {
    expect(
      (
        await GET(
          new Request(
            `https://example.test/api/services/synthetic/referral-management?after=${id(2)}`,
          ),
          context,
        )
      ).status,
    ).toBe(200);
    expect(m.overview).toHaveBeenCalledWith(expect.any(Object), id(2));
    expect(
      (
        await GET(
          new Request('https://example.test/api/services/synthetic/referral-management?userId=x'),
          context,
        )
      ).status,
    ).toBe(400);
  });
});
