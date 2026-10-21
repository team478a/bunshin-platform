import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

vi.mock('server-only', () => ({}));

const f = vi.hoisted(() => ({
  actor: vi.fn(),
  lessonProviderPath: vi.fn(),
  conversationProviderPath: vi.fn(),
  supportProviderPath: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: vi.fn().mockResolvedValue({
    getCurrentUser: vi.fn().mockResolvedValue({ userId: 'user' }),
  }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: vi.fn() }));
vi.mock('../src/services/personal-learning-request-access', () => ({
  resolvePersonalLearningRequestActor: f.actor,
}));
vi.mock('../src/services/personal-learning-lesson-candidate', () => ({
  prepareLearningLesson: f.lessonProviderPath,
}));
vi.mock('../src/services/personal-learning-conversation', () => ({
  sendPersonalLearningConversationTurn: f.conversationProviderPath,
}));
vi.mock('../src/services/personal-learning-practice-support', () => ({
  requestPracticeSupport: f.supportProviderPath,
}));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaPersonalLearningConversationRepository: class {},
  PrismaPracticeSupportRepository: class {},
}));

import { learningCandidateResponse } from '../src/http/personal-learning-lesson-candidate';
import { personalLearningConversationResponse } from '../src/http/personal-learning-conversation';
import { learningPracticeSupportResponse } from '../src/http/personal-learning-practice-support';

const enrollmentId = '00000000-0000-4000-8000-000000000001';
const request = () =>
  new Request('https://example.test/learning', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });

describe('invalid offer policy screen route boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.actor.mockRejectedValue(new ApplicationError('NOT_FOUND', 'learning request unavailable'));
  });

  it.each([
    ['lesson', learningCandidateResponse, f.lessonProviderPath],
    ['conversation', personalLearningConversationResponse, f.conversationProviderPath],
    ['support', learningPracticeSupportResponse, f.supportProviderPath],
  ])('does not reach the %s AI Provider path', async (_name, handler, providerPath) => {
    const response = await handler(request(), 'service', enrollmentId);

    expect(response.status).toBe(404);
    expect(providerPath).not.toHaveBeenCalled();
  });
});
