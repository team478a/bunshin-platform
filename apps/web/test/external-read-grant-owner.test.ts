import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  target: vi.fn(),
  manager: vi.fn(),
  view: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
  issue: vi.fn(),
  revoke: vi.fn(),
  list: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/auth/request-security', () => ({
  requireSameOrigin: (r: Request) => {
    if (r.headers.get('origin') !== 'http://localhost:3000')
      throw new ApplicationError('FORBIDDEN', 'origin');
  },
}));
vi.mock('../src/services/external-read-grant-owner', () => ({
  externalReadGrantOwner: m.target,
  externalGrantOwnerManager: m.manager,
  externalGrantOwnerView: m.view,
}));
vi.mock('../src/http/member-usage-read-limit', () => ({
  MemberUsageReadLimit: class {
    reserve = m.reserve;
  },
}));
import { externalGrantOwnerResponse } from '../src/http/external-read-grant-owner';
import {
  GET,
  POST,
  DELETE,
  dynamic,
  runtime,
} from '../app/api/services/[serviceSlug]/bunshins/[bunshinId]/external-read-grants/route';
const id = '11111111-1111-4111-8111-111111111111';
const owner = {
  actorUserId: id,
  scope: { workspaceId: id, serviceId: id, groupMembershipId: id, userId: id, bunshinId: id },
};
const issue = {
  commandId: id,
  clientId: 'reviewed-client',
  operation: 'member-usage:read',
  expiresInMinutes: 60,
  consentVersion: 'external-read-consent-v1',
};
function request(method = 'GET', body?: unknown, origin = 'http://localhost:3000') {
  return new Request('http://localhost:3000/api/grants', {
    method,
    headers: { origin, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const run = (r: Request) => externalGrantOwnerResponse(r, 'hassy', id);
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: id });
  m.target.mockResolvedValue({ owner, targetName: '本人', serviceName: 'Synthetic' });
  m.manager.mockResolvedValue({ issue: m.issue, revoke: m.revoke, list: m.list });
  m.issue.mockResolvedValue({ connectionId: id });
  m.revoke.mockResolvedValue({ connectionId: id });
  m.view.mockResolvedValue({ grants: [], clients: [] });
  m.reserve.mockReturnValue({ allowed: true, release: m.release });
});
describe('owner grant HTTP boundary', () => {
  it('serves only server-resolved owner context with no-store', async () => {
    const response = await run(request());
    expect(response.status).toBe(200);
    expect(m.target).toHaveBeenCalledWith('hassy', id, id);
    expect(m.view).toHaveBeenCalledWith({ owner, targetName: '本人', serviceName: 'Synthetic' });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(m.issue).not.toHaveBeenCalled();
  });
  it('issues only the strict command and never returns owner scope or credential data', async () => {
    const response = await run(request('POST', issue));
    expect(response.status).toBe(200);
    expect(m.issue).toHaveBeenCalledWith(owner, issue);
    const body = (await response.json()) as { data: unknown };
    expect(body.data).toEqual({ saved: true, connectionId: id });
    expect(m.view).not.toHaveBeenCalled();
    expect(m.release).toHaveBeenCalledOnce();
  });
  it('revokes with the server owner and expected revision even when issuance is stopped', async () => {
    const response = await run(request('DELETE', { connectionId: id, expectedRevision: 1 }));
    expect(response.status).toBe(200);
    expect(m.revoke).toHaveBeenCalledWith(owner, { connectionId: id, expectedRevision: 1 });
  });
  it('requires authentication before scope or body access', async () => {
    m.actor.mockResolvedValue(null);
    expect((await run(request('POST', issue))).status).toBe(401);
    expect(m.target).not.toHaveBeenCalled();
  });
  it.each(['https://evil.example', 'null', ''])(
    'rejects a foreign/missing origin %s',
    async (origin) => {
      expect((await run(request('POST', issue, origin))).status).toBe(403);
      expect(m.target).not.toHaveBeenCalled();
      expect(m.issue).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...issue, userId: id },
    { ...issue, environment: 'production' },
    { ...issue, operation: 'publish:write' },
    { ...issue, consentVersion: 'old' },
    { ...issue, expiresInMinutes: 1441 },
    { ...issue, scope: owner.scope },
  ])('rejects expanded command %j', async (body) => {
    expect((await run(request('POST', body))).status).toBe(400);
    expect(m.issue).not.toHaveBeenCalled();
    expect(m.release).toHaveBeenCalledOnce();
  });
  it('rejects oversized streamed JSON without trusting Content-Length', async () => {
    const response = await run(request('POST', { ...issue, unexpected: 'あ'.repeat(2000) }));
    expect(response.status).toBe(400);
    expect(m.issue).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON and non-JSON', async () => {
    expect(
      (
        await run(
          new Request('http://localhost:3000/api', {
            method: 'POST',
            headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
            body: '{',
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await run(
          new Request('http://localhost:3000/api', {
            method: 'POST',
            headers: { origin: 'http://localhost:3000' },
            body: 'text',
          }),
        )
      ).status,
    ).toBe(400);
  });
  it('rejects query-based scope overrides', async () => {
    expect((await run(new Request('http://localhost:3000/api?userId=other'))).status).toBe(400);
    expect(m.target).not.toHaveBeenCalled();
  });
  it('rate limits before any database resolution', async () => {
    m.reserve.mockReturnValue({ allowed: false, retryAfterSeconds: 60 });
    const r = await run(request());
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('60');
    expect(m.target).not.toHaveBeenCalled();
  });
  it('does not allow an unavailable owner, never an administrator bypass', async () => {
    m.target.mockRejectedValue(new ApplicationError('NOT_FOUND', 'private'));
    expect((await run(request())).status).toBe(404);
    expect(m.manager).not.toHaveBeenCalled();
  });
  it('maps stale revision and storage failure without leaking raw errors', async () => {
    m.revoke.mockRejectedValue(new ApplicationError('CONFLICT', 'stale'));
    expect((await run(request('DELETE', { connectionId: id, expectedRevision: 1 }))).status).toBe(
      409,
    );
    m.issue.mockRejectedValue(new Error('secret'));
    const r = await run(request('POST', issue));
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain('secret');
  });
  it('fails closed on an unsupported environment without writing', async () => {
    m.manager.mockResolvedValue(null);
    expect((await run(request('POST', issue))).status).toBe(503);
    expect(m.issue).not.toHaveBeenCalled();
  });
  it('wires normal Node routes for every supported method', async () => {
    const ctx = { params: Promise.resolve({ serviceSlug: 'hassy', bunshinId: id }) };
    expect(dynamic).toBe('force-dynamic');
    expect(runtime).toBe('nodejs');
    expect((await GET(request(), ctx)).status).toBe(200);
    expect((await POST(request('POST', issue), ctx)).status).toBe(200);
    expect(
      (await DELETE(request('DELETE', { connectionId: id, expectedRevision: 1 }), ctx)).status,
    ).toBe(200);
  });
});
