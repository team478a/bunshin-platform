import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const f = vi.hoisted(() => ({
  actor: vi.fn(),
  access: vi.fn(),
  origin: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: f.actor }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: f.origin }));
vi.mock('../src/services/personal-learning-request-access', () => ({
  resolvePersonalLearningRequestActor: f.access,
}));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaPersonalLearningRequestRepository: class {
    readRequest = f.read;
    saveRequest = f.save;
  },
}));
import { personalLearningRequestResponse } from '../src/http/personal-learning-request';
const content = {
  originalText: ' AIでホームページを作りたい\n',
  deviceType: null,
  toolDescription: null,
  experienceDescription: null,
  currentPosition: null,
};
const payload = {
  content,
  expectedRevision: 0,
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
};
function post(value: unknown = payload) {
  return new Request('http://localhost/api/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
}
describe('free learning request HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.actor.mockResolvedValue({ userId: 'actor' });
    f.access.mockResolvedValue({ actorUserId: 'actor', scope: {} });
    f.read.mockResolvedValue(null);
    f.save.mockResolvedValue({ ...content, id: 'saved', revision: 1 });
    f.origin.mockImplementation(() => {});
  });
  it('preserves the wish without trimming or inventing experience', async () => {
    expect((await personalLearningRequestResponse(post(), 'service', 'enrollment')).status).toBe(
      200,
    );
    expect(f.save).toHaveBeenCalledWith(expect.objectContaining(payload));
  });
  it('GET is read-only and uncached', async () => {
    const response = await personalLearningRequestResponse(
      new Request('http://localhost/api/request'),
      'service',
      'enrollment',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(f.save).not.toHaveBeenCalled();
    expect(f.read).toHaveBeenCalledOnce();
  });
  it('unauthenticated access denied', async () => {
    f.actor.mockResolvedValue(null);
    expect((await personalLearningRequestResponse(post(), 's', 'e')).status).toBe(401);
    expect(f.access).not.toHaveBeenCalled();
  });
  it('cross-origin write denied before access', async () => {
    f.origin.mockImplementation(() => {
      throw new ApplicationError('FORBIDDEN', 'denied');
    });
    expect((await personalLearningRequestResponse(post(), 's', 'e')).status).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });
  it('disabled or other enrollment access denied', async () => {
    f.access.mockRejectedValue(new ApplicationError('NOT_FOUND', 'hidden'));
    expect((await personalLearningRequestResponse(post(), 's', 'e')).status).toBe(404);
    expect(f.save).not.toHaveBeenCalled();
  });
  it.each([
    { ...payload, userId: 'foreign' },
    { ...payload, content: { ...content, originalText: '   ' } },
    { ...payload, expectedRevision: -1 },
    { ...payload, content: { ...content, deviceType: 'UNKNOWN' } },
    { ...payload, content: { ...content, originalText: 'x'.repeat(2001) } },
  ])('strict validation rejects invalid/scope-injecting data', async (value) => {
    expect((await personalLearningRequestResponse(post(value), 's', 'e')).status).toBe(400);
    expect(f.save).not.toHaveBeenCalled();
  });
  it('bounded input rejects oversized body', async () => {
    expect(
      (await personalLearningRequestResponse(post({ garbage: 'x'.repeat(16001) }), 's', 'e'))
        .status,
    ).toBe(400);
    expect(f.save).not.toHaveBeenCalled();
  });
  it('conflict does not expose text or database error', async () => {
    f.save.mockRejectedValue(new ApplicationError('CONFLICT', content.originalText));
    const response = await personalLearningRequestResponse(post(), 's', 'e');
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain(content.originalText);
  });
});
