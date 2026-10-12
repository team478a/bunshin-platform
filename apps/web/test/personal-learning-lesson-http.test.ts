import { beforeEach, describe, it, expect, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const f = vi.hoisted(() => ({
  user: vi.fn(),
  access: vi.fn(),
  origin: vi.fn(),
  read: vi.fn(),
  confirm: vi.fn(),
  generate: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: async () => ({ getCurrentUser: f.user }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: f.origin }));
vi.mock('../src/services/personal-learning-request-access', () => ({
  resolvePersonalLearningRequestActor: f.access,
}));
vi.mock('../src/services/personal-learning-lesson-candidate', () => ({
  prepareLearningLesson: f.generate,
}));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaLearningCandidateRepository: class {
    readCandidate = f.read;
    confirm = f.confirm;
  },
}));
import { learningCandidateResponse } from '../src/http/personal-learning-lesson-candidate';
const id = '11111111-1111-4111-8111-111111111111';
const post = (value: unknown) =>
  new Request('http://localhost/api/lesson', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
describe('lesson candidate HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.user.mockResolvedValue({ userId: id });
    f.access.mockResolvedValue({ actorUserId: id, scope: {} });
    f.origin.mockImplementation(() => {});
    f.read.mockResolvedValue(null);
    f.confirm.mockResolvedValue({ id });
  });
  it('GET never generates or confirms', async () => {
    const r = await learningCandidateResponse(
      new Request('http://localhost/api/lesson'),
      'service',
      id,
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(f.generate).not.toHaveBeenCalled();
    expect(f.confirm).not.toHaveBeenCalled();
  });
  it('confirmation only references saved ID and version, not AI content', async () => {
    const r = await learningCandidateResponse(
      post({ action: 'CONFIRM', requestId: id, requestRevision: 1, candidateId: id }),
      'service',
      id,
    );
    expect(r.status).toBe(200);
    expect(f.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: id, requestRevision: 1 }),
    );
    expect(f.generate).not.toHaveBeenCalled();
  });
  it('rejects client proposals and prices', async () => {
    expect(
      (
        await learningCandidateResponse(
          post({
            action: 'GENERATE',
            requestId: id,
            requestRevision: 1,
            operationId: id,
            proposal: {},
            pricing: [],
          }),
          'service',
          id,
        )
      ).status,
    ).toBe(400);
    expect(f.generate).not.toHaveBeenCalled();
  });
  it('denies unauthenticated reads', async () => {
    f.user.mockResolvedValue(null);
    expect(
      (await learningCandidateResponse(new Request('http://localhost/api/lesson'), 's', id)).status,
    ).toBe(401);
    expect(f.read).not.toHaveBeenCalled();
  });
  it('denies cross-origin confirmation', async () => {
    f.origin.mockImplementation(() => {
      throw new ApplicationError('FORBIDDEN', 'blocked');
    });
    expect(
      (
        await learningCandidateResponse(
          post({ action: 'CONFIRM', requestId: id, requestRevision: 1, candidateId: id }),
          's',
          id,
        )
      ).status,
    ).toBe(403);
    expect(f.confirm).not.toHaveBeenCalled();
  });
});
