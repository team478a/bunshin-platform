import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const f = vi.hoisted(() => ({
  user: vi.fn(),
  actor: vi.fn(),
  origin: vi.fn(),
  support: vi.fn(),
  readImage: vi.fn(),
}));
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
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaPracticeSupportRepository: class {
    readSupportImage = f.readImage;
  },
}));
import {
  learningPracticeSupportImageResponse,
  learningPracticeSupportResponse,
} from '../src/http/personal-learning-practice-support';
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
    expect(f.support).toHaveBeenCalledWith({
      ...input,
      image: null,
      actor: { actorUserId: 'user', scope: {} },
    });
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
  it('serves a private image only after session and enrollment resolution', async () => {
    const bytes = Uint8Array.from([255, 216, 255, 217]);
    f.readImage.mockResolvedValue({ mimeType: 'image/jpeg', bytes });
    const response = await learningPracticeSupportImageResponse(
      new Request('http://localhost/support/image'),
      's',
      'e',
      id,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(f.readImage).toHaveBeenCalledWith({
      actor: { actorUserId: 'user', scope: {} },
      requestId: id,
    });
    f.actor.mockRejectedValue(new ApplicationError('NOT_FOUND', 'hidden'));
    expect(
      (
        await learningPracticeSupportImageResponse(
          new Request('http://localhost/support/image'),
          's',
          'e',
          id,
        )
      ).status,
    ).toBe(404);
    expect(f.readImage).toHaveBeenCalledOnce();
  });
});
