import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  service: vi.fn(),
  member: vi.fn(),
  bunshin: vi.fn(),
  question: vi.fn(),
  support: vi.fn(),
  answer: vi.fn(),
  transition: vi.fn(),
  exposure: vi.fn(),
  questionExposure: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.test' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: m.service }));
vi.mock('../src/http/member-usage-read-limit', () => ({
  memberUsageReadLimit: { reserve: m.reserve },
}));
vi.mock('@bunshin/database', () => ({
  prisma: { groupMembership: { findFirst: m.member }, bunshin: { findFirst: m.bunshin } },
  PrismaSocialActivityBarrierConfirmationRepository: class {
    getPendingQuestion = m.question;
    getActiveSupport = m.support;
    answer = m.answer;
    transitionSupport = m.transition;
    recordExposure = m.exposure;
    recordQuestionExposure = m.questionExposure;
  },
}));
import {
  recordServiceSocialActivitySupportExposureResponse as expose,
  recordServiceSocialActivityQuestionExposureResponse as exposeQuestion,
  getServiceSocialActivityBarrierResponse as read,
  answerServiceSocialActivityBarrierResponse as answer,
  transitionServiceSocialActivitySupportResponse as transition,
} from '../src/http/service-social-activity-barrier';
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const url = `https://example.test/api/services/synthetic/bunshins/${id(5)}/activity-barrier`;
const body = () => ({ caseIds: [id(6)], selectedCaseId: id(6), idempotencyKey: id(7) });
const request = (value: unknown, method = 'POST', origin = 'https://example.test') =>
  new Request(url, {
    method,
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: id(1) });
  m.service.mockResolvedValue({ workspaceId: id(2), serviceId: id(3) });
  m.member.mockResolvedValue({ id: id(4) });
  m.bunshin.mockResolvedValue({ id: id(5) });
  m.exposure.mockResolvedValue(true);
  m.questionExposure.mockResolvedValue(true);
  m.question.mockResolvedValue(null);
  m.support.mockResolvedValue(null);
  m.answer.mockResolvedValue({ response: 'NONE_OF_THESE', support: null });
  m.transition.mockResolvedValue({ id: id(8), status: 'SKIPPED' });
  m.reserve.mockReturnValue({ allowed: true, release: m.release });
});
describe('SOCIAL support HTTP access', () => {
  it('authenticates before reading scope or accepting feedback', async () => {
    m.actor.mockResolvedValue(null);
    expect((await answer(request(body()), 'synthetic', id(5))).status).toBe(401);
    expect(m.service).not.toHaveBeenCalled();
    expect(m.answer).not.toHaveBeenCalled();
  });
  it('returns private noncached data and releases the per-user limit', async () => {
    const response = await read(new Request(url), 'synthetic', id(5));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie, Authorization');
    expect(m.release).toHaveBeenCalledOnce();
  });
  it('binds feedback only to the authenticated service membership and Bunshin', async () => {
    expect(
      (
        await transition(
          request({ supportId: id(8), action: 'SKIP', reason: '不要です' }, 'PATCH'),
          'synthetic',
          id(5),
        )
      ).status,
    ).toBe(200);
    expect(m.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: {
          workspaceId: id(2),
          serviceId: id(3),
          groupMembershipId: id(4),
          userId: id(1),
          bunshinId: id(5),
        },
        reason: '不要です',
      }),
    );
    expect(m.bunshin).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: id(2),
          groupId: id(3),
          ownerUserId: id(1),
          id: id(5),
        }),
      }),
    );
  });
  it.each([
    { supportId: id(8), action: 'COMPLETE', reason: 'x' },
    { supportId: id(8), action: 'SKIP', reason: 'x'.repeat(501) },
    { supportId: id(8), action: 'SKIP', workspaceId: id(9) },
    { supportId: id(8), action: 'UNLOCK_FEATURE' },
  ])('rejects unexpected or oversized input', async (value) => {
    expect((await transition(request(value, 'PATCH'), 'synthetic', id(5))).status).toBe(400);
    expect(m.transition).not.toHaveBeenCalled();
    expect(m.release).toHaveBeenCalledOnce();
  });
  it('rejects cross-origin writes without accessing the repository', async () => {
    expect(
      (await answer(request(body(), 'POST', 'https://other.test'), 'synthetic', id(5))).status,
    ).toBe(403);
    expect(m.answer).not.toHaveBeenCalled();
  });
  it('rejects invalid id and caller-controlled query before data reads', async () => {
    expect((await read(new Request(url), 'synthetic', 'bad')).status).toBe(400);
    expect((await read(new Request(url + '?userId=x'), 'synthetic', id(5))).status).toBe(400);
    expect(m.bunshin).not.toHaveBeenCalled();
  });
  it('keeps ownership and stale transition errors closed', async () => {
    m.bunshin.mockResolvedValue(null);
    expect((await answer(request(body()), 'synthetic', id(5))).status).toBe(404);
    m.bunshin.mockResolvedValue({ id: id(5) });
    m.transition.mockResolvedValue(null);
    expect(
      (
        await transition(
          request({ supportId: id(8), action: 'ACCEPT' }, 'PATCH'),
          'synthetic',
          id(5),
        )
      ).status,
    ).toBe(409);
  });
  it('rate limits before resolving a service', async () => {
    m.reserve.mockReturnValue({ allowed: false, retryAfterSeconds: 30 });
    const response = await read(new Request(url), 'synthetic', id(5));
    expect(response.status).toBe(429);
    expect(m.service).not.toHaveBeenCalled();
  });
});

describe('SOCIAL support exposure HTTP', () => {
  it('uses authenticated ownership, strict inputs, origin, limit and private response', async () => {
    const response = await expose(
      request({ supportId: id(8), kind: 'DETAILS' }),
      'synthetic',
      id(5),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(m.exposure).toHaveBeenCalledWith({
      supportId: id(8),
      kind: 'DETAILS',
      scope: {
        workspaceId: id(2),
        serviceId: id(3),
        groupMembershipId: id(4),
        userId: id(1),
        bunshinId: id(5),
      },
    });
    expect(m.transition).not.toHaveBeenCalled();
  });
  it.each([
    { supportId: id(8), kind: 'DISPLAY', occurredAt: 'invented' },
    { supportId: id(8), kind: 'ACCEPT' },
  ])('rejects surplus or unsupported exposure payloads', async (value) => {
    expect((await expose(request(value), 'synthetic', id(5))).status).toBe(400);
    expect(m.exposure).not.toHaveBeenCalled();
  });
  it('rejects cross-origin, unauthenticated and unavailable supports', async () => {
    expect(
      (
        await expose(
          request({ supportId: id(8), kind: 'DISPLAY' }, 'POST', 'https://foreign.test'),
          'synthetic',
          id(5),
        )
      ).status,
    ).toBe(403);
    m.actor.mockResolvedValue(null);
    expect(
      (await expose(request({ supportId: id(8), kind: 'DISPLAY' }), 'synthetic', id(5))).status,
    ).toBe(401);
    expect(m.exposure).not.toHaveBeenCalled();
    m.actor.mockResolvedValue({ userId: id(1) });
    m.exposure.mockResolvedValue(false);
    expect(
      (await expose(request({ supportId: id(8), kind: 'DISPLAY' }), 'synthetic', id(5))).status,
    ).toBe(409);
  });
});

describe('question visibility receipt HTTP', () => {
  it('uses only the authenticated scope and server timestamp', async () => {
    const response = await exposeQuestion(request({ caseIds: [id(6)] }), 'synthetic', id(5));
    expect(response.status).toBe(200);
    expect(m.questionExposure).toHaveBeenCalledWith({
      scope: {
        workspaceId: id(2),
        serviceId: id(3),
        groupMembershipId: id(4),
        userId: id(1),
        bunshinId: id(5),
      },
      caseIds: [id(6)],
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it.each([
    { caseIds: [] },
    { caseIds: [id(6)], workspaceId: id(9) },
    { caseIds: [id(6)], displayedAt: '2026-11-01Z' },
    { caseIds: ['invalid'] },
  ])('rejects surplus or invalid receipt %j', async (value) => {
    expect((await exposeQuestion(request(value), 'synthetic', id(5))).status).toBe(400);
    expect(m.questionExposure).not.toHaveBeenCalled();
  });
  it('rejects foreign origins and current ownership revocation', async () => {
    expect(
      (
        await exposeQuestion(
          request({ caseIds: [id(6)] }, 'POST', 'https://foreign.test'),
          'synthetic',
          id(5),
        )
      ).status,
    ).toBe(403);
    m.member.mockResolvedValue(null);
    expect((await exposeQuestion(request({ caseIds: [id(6)] }), 'synthetic', id(5))).status).toBe(
      404,
    );
    expect(m.questionExposure).not.toHaveBeenCalled();
  });
});
