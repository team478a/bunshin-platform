import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  descriptor: vi.fn(),
  target: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.test' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/http/member-usage-read-limit', () => ({
  memberUsageReadLimit: { reserve: m.reserve },
}));
vi.mock('@bunshin/database', () => ({
  prisma: { serviceConfiguration: { findUnique: m.target } },
  PrismaManagedFeaturePolicyRepository: class {
    constructor(definition: unknown) {
      m.descriptor(definition);
    }
    read = m.read;
    save = m.save;
  },
}));
import { hassyRoadmapPolicyResponse as run } from '../src/http/hassy-roadmap-policy';
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const body = () => ({
  commandId: id(4),
  expectedRevision: 0,
  authority: 'HEADQUARTERS',
  settings: { generated: 2, decisions: 2, activeDays: 4, validReferrals: 0 },
  reason: 'Synthetic',
});
const request = (value: unknown, origin = 'https://example.test') =>
  new Request('https://example.test/api/services/synthetic/roadmap-policy', {
    method: 'PUT',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: id(1) });
  m.target.mockResolvedValue({ workspaceId: id(2), groupId: id(3) });
  m.read.mockResolvedValue({ revision: 0 });
  m.save.mockResolvedValue({ revision: 1 });
  m.reserve.mockReturnValue({ allowed: true, release: m.release });
});
describe('Hassy roadmap policy HTTP boundary', () => {
  it('authenticates first, fixes scope server-side and returns private responses', async () => {
    const response = await run(request(body()), 'synthetic');
    expect(response.status).toBe(200);
    expect(m.descriptor).toHaveBeenCalledWith(
      expect.objectContaining({
        featureKey: 'SOCIAL.ACTIVITY_SUPPORT',
        configKey: 'hassyRoadmapPolicy',
        requiredOnboardingTemplate: 'HASSY',
      }),
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie, Authorization');
    expect(m.save).toHaveBeenCalledWith({
      ...body(),
      workspaceId: id(2),
      serviceId: id(3),
      actorUserId: id(1),
    });
    expect(m.release).toHaveBeenCalledOnce();
  });
  it('does not read settings without authentication', async () => {
    m.actor.mockResolvedValue(null);
    expect(
      (
        await run(
          new Request('https://example.test/api/services/synthetic/roadmap-policy'),
          'synthetic',
        )
      ).status,
    ).toBe(401);
    expect(m.target).not.toHaveBeenCalled();
  });
  it.each([
    { ...body(), serviceId: id(9) },
    { ...body(), authority: 'OWNER' },
    { ...body(), expectedRevision: -1 },
  ])('rejects injected scope and invalid commands', async (value) => {
    expect((await run(request(value), 'synthetic')).status).toBe(400);
    expect(m.save).not.toHaveBeenCalled();
  });
  it('rejects cross-origin writes before scope resolution', async () => {
    expect((await run(request(body(), 'https://foreign.test'), 'synthetic')).status).toBe(403);
    expect(m.target).not.toHaveBeenCalled();
  });
  it('rejects queries and applies the existing per-user rate guard', async () => {
    expect(
      (
        await run(
          new Request('https://example.test/api/services/synthetic/roadmap-policy?user=x'),
          'synthetic',
        )
      ).status,
    ).toBe(400);
    m.reserve.mockReturnValue({ allowed: false, retryAfterSeconds: 5 });
    expect((await run(request(body()), 'synthetic')).status).toBe(429);
    expect(m.target).not.toHaveBeenCalled();
  });
  it('preserves conflict, validation and ownership denial instead of returning success', async () => {
    for (const [code, status] of [
      ['CONFLICT', 409],
      ['VALIDATION_ERROR', 400],
      ['NOT_FOUND', 404],
      ['FORBIDDEN', 403],
    ] as const) {
      m.save.mockRejectedValue(new ApplicationError(code, 'Synthetic'));
      expect((await run(request(body()), 'synthetic')).status).toBe(status);
    }
  });
});
