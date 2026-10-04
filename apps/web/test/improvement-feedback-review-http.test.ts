import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const fake = vi.hoisted(() => ({ actor: vi.fn(), scope: vi.fn(), execute: vi.fn() }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: fake.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: fake.scope }));
vi.mock('../src/services/improvement-feedback-review', () => ({
  executeFeedbackReview: fake.execute,
}));
vi.mock('../src/auth/request-security', () => ({
  requireSameOrigin: (r: Request) => {
    if (r.headers.get('origin') !== 'https://example.test')
      throw new ApplicationError('FORBIDDEN', 'origin');
  },
}));
import { feedbackReviewResponse } from '../src/http/improvement-feedback-review';
const command = { action: 'PREPARE', handle: 'a'.repeat(120) };
const request = (
  body: unknown = command,
  origin = 'https://example.test',
  contentType = 'application/json',
) =>
  new Request('https://example.test/api/services/fixture/improvement-feedback/review', {
    method: 'POST',
    headers: { origin, 'content-type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('external communication forbidden');
    }),
  );
  fake.actor.mockResolvedValue({ userId: 'actor' });
  fake.scope.mockResolvedValue({
    workspaceId: 'workspace',
    serviceId: 'service',
    serviceRole: 'SERVICE_ADMIN',
  });
  fake.execute.mockResolvedValue({ state: 'OPEN', handle: 'encrypted' });
});
afterEach(() => vi.unstubAllGlobals());
describe('feedback review HTTP boundary', () => {
  it('derives authenticated actor/scope and returns no-store sanitized data', async () => {
    const r = await feedbackReviewResponse(request(), 'fixture');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(fake.scope).toHaveBeenCalledWith('fixture', 'actor', 'ADMINISTRATION');
    expect(fake.execute).toHaveBeenCalledWith({
      workspaceId: 'workspace',
      serviceId: 'service',
      actorUserId: 'actor',
      command,
    });
    expect(await r.json()).toEqual({ data: { state: 'OPEN', handle: 'encrypted' } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects cross-origin and missing sessions before resolving service', async () => {
    expect(
      (await feedbackReviewResponse(request(command, 'https://evil.test'), 'fixture')).status,
    ).toBe(403);
    expect(fake.actor).not.toHaveBeenCalled();
    fake.actor.mockResolvedValue(null);
    expect((await feedbackReviewResponse(request(), 'fixture')).status).toBe(401);
    expect(fake.scope).not.toHaveBeenCalled();
  });
  it.each(['CONTENT_EDITOR', 'PARTICIPANT', 'PLATFORM_ADMIN'])(
    'denies %s before repository work',
    async (role) => {
      fake.scope.mockResolvedValue({ serviceRole: role });
      expect((await feedbackReviewResponse(request(), 'fixture')).status).toBe(404);
      expect(fake.execute).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...command, workspaceId: 'forged' },
    { ...command, evidenceRevision: 'forged' },
    { ...command, action: 'APPROVED' },
    { ...command, action: 'DISMISS', reasonCode: 'OUT_OF_SCOPE' },
    {
      ...command,
      action: 'MARK_REVIEWED',
      reasonCode: 'OUT_OF_SCOPE',
      confirmation: 'RECORD_REVIEW',
    },
    '{',
    'x'.repeat(4097),
  ])('rejects invalid/oversized body without executing', async (body) => {
    expect((await feedbackReviewResponse(request(body), 'fixture')).status).toBe(400);
    expect(fake.execute).not.toHaveBeenCalled();
  });
  it('requires JSON and maps DB/conflict errors without private details', async () => {
    expect(
      (await feedbackReviewResponse(request(command, undefined, 'text/plain'), 'fixture')).status,
    ).toBe(400);
    fake.execute.mockRejectedValue(new Error('PRIVATE_DB_PASSWORD'));
    const r = await feedbackReviewResponse(request(), 'fixture');
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain('PRIVATE_');
    fake.execute.mockRejectedValue(new ApplicationError('CONFLICT', 'PRIVATE_DIGEST'));
    expect((await feedbackReviewResponse(request(), 'fixture')).status).toBe(409);
  });
});
