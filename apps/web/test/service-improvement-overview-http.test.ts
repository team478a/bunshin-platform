import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const fake = vi.hoisted(() => ({
  actor: vi.fn(),
  service: vi.fn(),
  packages: vi.fn(),
  read: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: fake.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: fake.service }));
vi.mock('../src/services/service-improvement-admin-data', () => ({
  availableOverviewPackages: fake.packages,
  loadServiceOverviewPreview: fake.read,
}));
vi.mock('../src/auth/request-security', () => ({
  requireSameOrigin: (r: Request) => {
    if (r.headers.get('origin') !== 'https://example.test')
      throw new ApplicationError('FORBIDDEN', 'origin');
  },
}));
import { serviceOverviewResponse } from '../src/http/service-improvement-overview';
import { fixtureOverview, overviewClock } from './service-improvement-overview-fixture';
import { feedbackPreviewWindow } from '../src/services/improvement-feedback-admin-preview';
import { projectOverviewPreview } from '../src/services/service-improvement-admin-preview';
const request = (query = 'kind=SOCIAL&week=2026-10-05', init?: RequestInit) =>
  new Request(`https://example.test/api/services/synthetic/improvement-overview?${query}`, init);
beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(overviewClock);
  fake.actor.mockResolvedValue({ userId: 'manager' });
  fake.service.mockResolvedValue({
    workspaceId: 'workspace',
    serviceId: 'service',
    serviceRole: 'SERVICE_ADMIN',
  });
  fake.packages.mockResolvedValue(['SOCIAL', 'TRAINING']);
  const window = feedbackPreviewWindow({}, overviewClock);
  if (window.outcome !== 'WINDOW') throw new Error('fixture');
  fake.read.mockResolvedValue(projectOverviewPreview(await fixtureOverview(), window, 'SOCIAL'));
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('external forbidden');
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('authenticated read-only overview HTTP contract', () => {
  it('derives scope and actor, returns only projected bands and no-store', async () => {
    const result = await serviceOverviewResponse(request(), 'synthetic');
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(fake.service).toHaveBeenCalledWith('synthetic', 'manager', 'ADMINISTRATION');
    expect(fake.read).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace',
        serviceId: 'service',
        actorUserId: 'manager',
        packageKey: 'SOCIAL',
        window: expect.objectContaining({
          fromInclusive: new Date('2026-10-04T15:00:00Z'),
          toExclusive: new Date('2026-10-11T15:00:00Z'),
        }),
      }),
    );
    expect(await result.text()).not.toContain('PRIVATE_');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('denies signed-out and cross-site requests before source access', async () => {
    fake.actor.mockResolvedValue(null);
    expect((await serviceOverviewResponse(request(), 'synthetic')).status).toBe(401);
    expect(
      (
        await serviceOverviewResponse(
          request(undefined, { headers: { 'sec-fetch-site': 'cross-site' } }),
          'synthetic',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await serviceOverviewResponse(
          request(undefined, { headers: { origin: 'https://evil.test' } }),
          'synthetic',
        )
      ).status,
    ).toBe(403);
    expect(fake.service).not.toHaveBeenCalled();
    expect(fake.read).not.toHaveBeenCalled();
  });
  it.each(['PARTICIPANT', 'CONTENT_EDITOR', 'PLATFORM_ADMIN'])(
    'does not grant %s cross-service authority',
    async (serviceRole) => {
      fake.service.mockResolvedValue({ serviceRole });
      expect((await serviceOverviewResponse(request(), 'synthetic')).status).toBe(404);
      expect(fake.packages).not.toHaveBeenCalled();
      expect(fake.read).not.toHaveBeenCalled();
    },
  );
  it.each([
    'workspaceId=x',
    'serviceId=x',
    'userRef=x',
    'bunshinRef=x',
    'limit=5',
    'from=x',
    'to=x',
    '__proto__=x',
    'week=2026-10-12',
    'week=2026-10-05&week=2026-09-28',
    'kind=SOCIAL&kind=TRAINING',
  ])('rejects filter/ongoing/repeated query %s before any scope/source read', async (extra) => {
    expect(
      (await serviceOverviewResponse(request(`kind=SOCIAL&${extra}`), 'synthetic')).status,
    ).toBe(400);
    expect(fake.service).not.toHaveBeenCalled();
    expect(fake.read).not.toHaveBeenCalled();
  });
  it('does not silently choose a package or accept a mutation method', async () => {
    expect((await serviceOverviewResponse(request('week=2026-10-05'), 'synthetic')).status).toBe(
      400,
    );
    expect(
      (
        await serviceOverviewResponse(
          request(undefined, { method: 'POST', body: '{}' }),
          'synthetic',
        )
      ).status,
    ).toBe(400);
    expect(fake.read).not.toHaveBeenCalled();
  });
  it('denies an unsupported package or lost DB authority', async () => {
    fake.packages.mockResolvedValue([]);
    expect((await serviceOverviewResponse(request(), 'synthetic')).status).toBe(404);
    expect(fake.read).not.toHaveBeenCalled();
    fake.packages.mockResolvedValue(['SOCIAL']);
    fake.read.mockRejectedValue(new ApplicationError('NOT_FOUND', 'PRIVATE'));
    expect((await serviceOverviewResponse(request(), 'synthetic')).status).toBe(404);
  });
  it('keeps source failure unavailable, not an empty successful response', async () => {
    fake.read.mockRejectedValue(new ApplicationError('DATABASE_UNAVAILABLE', 'PRIVATE_SECRET'));
    const result = await serviceOverviewResponse(request(), 'synthetic');
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('PRIVATE_SECRET');
  });
  it('does not read another service after resolver denial', async () => {
    fake.service.mockRejectedValue(new Error('SERVICE_NOT_FOUND'));
    expect((await serviceOverviewResponse(request(), 'other')).status).toBe(404);
    expect(fake.packages).not.toHaveBeenCalled();
    expect(fake.read).not.toHaveBeenCalled();
  });
});
