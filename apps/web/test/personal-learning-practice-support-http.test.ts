import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const f = vi.hoisted(() => ({ user: vi.fn(), actor: vi.fn(), origin: vi.fn(), support: vi.fn() }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: f.user }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: f.origin }));
vi.mock('../src/services/personal-learning-request-access', () => ({
  resolvePersonalLearningRequestActor: f.actor,
}));
vi.mock('../src/services/personal-learning-practice-support', () => ({
  requestPracticeSupport: f.support,
}));
import { learningPracticeSupportResponse } from '../src/http/personal-learning-practice-support';
const id = '11111111-1111-4111-8111-111111111111';
const input = {
  assignmentId: id,
  operationId: id,
  expectedNoteRevision: 0,
  expectedSupportRevision: 0,
  reason: 'ENVIRONMENT_MISMATCH',
  text: '画面が違う',
};
const post = (value: unknown = input) =>
  new Request('http://localhost/support', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
describe('practice support HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.user.mockResolvedValue({ userId: 'user' });
    f.actor.mockResolvedValue({ actorUserId: 'user', scope: {} });
    f.support.mockResolvedValue({ assignmentId: id });
    f.origin.mockImplementation(() => {});
  });
  it('uses session actor and saved assignment versions; never learner supplied model or price', async () => {
    const response = await learningPracticeSupportResponse(post(), 's', 'e');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(f.support).toHaveBeenCalledWith({ ...input, actor: { actorUserId: 'user', scope: {} } });
  });
  it('requires same origin before authorization', async () => {
    f.origin.mockImplementation(() => {
      throw new ApplicationError('FORBIDDEN', 'hidden');
    });
    expect((await learningPracticeSupportResponse(post(), 's', 'e')).status).toBe(403);
    expect(f.actor).not.toHaveBeenCalled();
  });
  it('requires login and own enrollment', async () => {
    f.user.mockResolvedValue(null);
    expect((await learningPracticeSupportResponse(post(), 's', 'e')).status).toBe(401);
    f.user.mockResolvedValue({ userId: 'user' });
    f.actor.mockRejectedValue(new ApplicationError('NOT_FOUND', 'hidden'));
    expect((await learningPracticeSupportResponse(post(), 's', 'e')).status).toBe(404);
    expect(f.support).not.toHaveBeenCalled();
  });
  it.each([
    { ...input, model: 'free' },
    { ...input, advice: {} },
    { ...input, expectedNoteRevision: -1 },
    { ...input, expectedSupportRevision: 1000 },
    { ...input, text: '' },
    { ...input, text: 'x'.repeat(501) },
    { ...input, reason: 'ABILITY_DECLINE' },
    { ...input, image: 'foreign-url' },
  ])('rejects unsafe input %j', async (value) => {
    expect((await learningPracticeSupportResponse(post(value), 's', 'e')).status).toBe(400);
    expect(f.support).not.toHaveBeenCalled();
  });
  it('redacts internal provider failure or learner content', async () => {
    f.support.mockRejectedValue(new ApplicationError('CONFLICT', input.text));
    const r = await learningPracticeSupportResponse(post(), 's', 'e');
    expect(r.status).toBe(409);
    expect(await r.text()).not.toContain(input.text);
  });
  it('GET is never an AI request', async () => {
    expect(
      (await learningPracticeSupportResponse(new Request('http://localhost/support'), 's', 'e'))
        .status,
    ).toBe(405);
    expect(f.support).not.toHaveBeenCalled();
  });
});
