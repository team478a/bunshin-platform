import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import { improvementFeedbackResponse } from '../src/http/improvement-feedback';
vi.mock('../src/auth/request-security', () => ({
  requireSameOrigin: (request: Request) => {
    if (request.headers.get('origin') !== 'https://example.test')
      throw new ApplicationError('FORBIDDEN', 'invalid origin');
  },
}));
const id = '00000000-0000-4000-8000-000000000001';
const payload = { submissionKey: id, category: 'OPERATION', surface: 'TODAY', impact: 'BLOCKED' };
const request = (
  body = JSON.stringify(payload),
  origin = 'https://example.test',
  contentType = 'application/json',
) =>
  new Request('https://example.test/api/feedback', {
    method: 'POST',
    headers: { origin, 'content-type': contentType },
    body,
  });
function dependencies() {
  const record = vi.fn().mockResolvedValue({ id, createdAt: new Date('2026-10-03T00:00:00Z') });
  return {
    record,
    actor: vi.fn().mockResolvedValue(id),
    scope: vi.fn().mockResolvedValue({ workspaceId: id, serviceId: id }),
    repository: () => Promise.resolve({ record }),
  };
}
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('external communication forbidden');
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('common trouble feedback HTTP', () => {
  it('derives actor, tenant and package server-side and returns only the receipt', async () => {
    const deps = dependencies();
    const response = await improvementFeedbackResponse(request(), 'service', id, deps);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ data: { id, createdAt: '2026-10-03T00:00:00.000Z' } });
    expect(deps.record).toHaveBeenCalledWith({
      ...payload,
      workspaceId: id,
      serviceId: id,
      bunshinId: id,
      actorUserId: id,
      packageKey: 'SOCIAL',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    JSON.stringify({ ...payload, actorUserId: id }),
    JSON.stringify({ ...payload, packageKey: 'TRAINING' }),
    JSON.stringify({ ...payload, comment: 'private text' }),
    '{',
    'x'.repeat(2049),
  ])('rejects invalid, excessive or private input before repository construction', async (body) => {
    const deps = dependencies();
    expect((await improvementFeedbackResponse(request(body), 'service', id, deps)).status).toBe(
      400,
    );
    expect(deps.record).not.toHaveBeenCalled();
    expect(deps.scope).not.toHaveBeenCalled();
  });
  it('rejects cross-origin and missing sessions', async () => {
    const deps = dependencies();
    expect(
      (
        await improvementFeedbackResponse(
          request(undefined, 'https://evil.test'),
          'service',
          id,
          deps,
        )
      ).status,
    ).toBe(403);
    expect(deps.actor).not.toHaveBeenCalled();
    deps.actor.mockResolvedValue(null);
    expect((await improvementFeedbackResponse(request(), 'service', id, deps)).status).toBe(401);
    expect(deps.record).not.toHaveBeenCalled();
  });
  it('does not leak database errors or report a successful save', async () => {
    const deps = dependencies();
    deps.record.mockRejectedValue(new Error('sensitive connection string'));
    const response = await improvementFeedbackResponse(request(), 'service', id, deps);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('sensitive');
  });
});
