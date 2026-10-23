import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const f = vi.hoisted(() => ({
  membership: vi.fn(),
  enrollment: vi.fn(),
  program: vi.fn(),
  topics: vi.fn(),
  transaction: vi.fn(),
  seat: vi.fn(),
  topicList: vi.fn(),
  topicCreate: vi.fn(),
  sendConversation: vi.fn(),
  prepareLesson: vi.fn(),
}));

vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => ({ APP_ENV: 'development' }) }));
vi.mock('@bunshin/capability-training', () => ({
  personalLearningDynamicProgramAllows: () => true,
  personalLearningOfferPolicy: () => 'AI_SKILL_V1',
  personalLearningFeatureEnabled: (value: unknown, feature: string) =>
    (value as { personalLearningPilot?: { learningFeatures?: Record<string, boolean> } })
      .personalLearningPilot?.learningFeatures?.[feature] === true,
}));
vi.mock('../src/services/public-service', () => ({
  resolveMemberServiceContext: vi.fn().mockResolvedValue({
    workspaceId: 'workspace-1',
    serviceId: 'service-1',
  }),
}));
vi.mock('../src/services/ai-training-consent', () => ({
  requireAiTrainingUsageConsent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: vi.fn().mockResolvedValue({
    getCurrentUser: vi.fn().mockResolvedValue({ userId: 'learner-1' }),
  }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: vi.fn() }));
vi.mock('@bunshin/observability', () => ({
  createLogger: () => ({ error: vi.fn() }),
  requestIdFromHeader: () => 'request-id',
}));
vi.mock('../src/services/personal-learning-conversation', () => ({
  sendPersonalLearningConversationTurn: f.sendConversation,
}));
vi.mock('../src/services/personal-learning-lesson-candidate', () => ({
  prepareLearningLesson: f.prepareLesson,
}));
vi.mock('../src/services/ai-training-evaluation-queue', () => ({
  enqueueAiTrainingEvaluation: vi.fn(),
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    groupMembership: { findFirst: f.membership },
    programEnrollment: { findFirst: f.enrollment },
    serviceProgram: { findFirst: f.program },
    personalLearningTopic: { findMany: f.topics },
    $transaction: f.transaction,
  },
  requirePersonalLearningPilotSeat: f.seat,
  PrismaPersonalLearningTopicRepository: class {
    list = f.topicList;
    create = f.topicCreate;
  },
  PrismaPersonalLearningRequestRepository: class {},
  PrismaPersonalLearningConversationRepository: class {},
  PrismaPersonalLearningPracticeRepository: class {},
  PrismaLearningCandidateRepository: class {},
  PrismaTrainingAnswerRepository: class {},
}));

import { personalLearningRequestResponse } from '../src/http/personal-learning-request';
import { personalLearningConversationResponse } from '../src/http/personal-learning-conversation';
import { learningPracticeResponse } from '../src/http/personal-learning-practice';
import { learningCandidateResponse } from '../src/http/personal-learning-lesson-candidate';
import { personalLearningTopicsResponse } from '../src/http/personal-learning-topics';
import { resolvePersonalLearningRequestActor } from '../src/services/personal-learning-request-access';

const enrollmentId = '00000000-0000-4000-8000-000000000001';
const topicA = '00000000-0000-4000-8000-000000000002';
const topicB = '00000000-0000-4000-8000-000000000003';
const settings = {
  moduleKey: 'AI_TRAINING_V1',
  personalLearningPilot: {
    enabled: true,
    enrollmentIds: [enrollmentId],
    learningMode: 'DYNAMIC_V1',
    learningFeatures: {
      conversation: true,
      multiTopic: true,
      lineLearning: false,
      extendedScope: false,
    },
  },
};

function request(path: string, method = 'GET', body?: unknown) {
  return new Request(`https://example.test${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json', origin: 'https://example.test' },
          body: JSON.stringify(body),
        }),
  });
}

describe('HTTP integration: multiTopic requires a selected topic for learner operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PERSONAL_LEARNING_REQUEST_INTAKE', 'true');
    f.membership.mockResolvedValue({ id: 'membership-1', serviceRole: 'PARTICIPANT' });
    f.enrollment.mockResolvedValue({ id: enrollmentId, serviceProgramId: 'program-1' });
    f.program.mockResolvedValue({ settings });
    f.topics.mockResolvedValue([{ id: topicA }, { id: topicB }]);
    f.transaction.mockImplementation((work: (tx: unknown) => unknown) => work({}));
    f.seat.mockResolvedValue(undefined);
    f.topicList.mockResolvedValue([
      { id: topicA, title: 'テーマA', status: 'ACTIVE' },
      { id: topicB, title: 'テーマB', status: 'ACTIVE' },
    ]);
    f.topicCreate.mockResolvedValue({
      outcome: 'CREATED',
      topic: { id: '00000000-0000-4000-8000-000000000004', title: '新しいテーマ' },
    });
  });

  it('rejects wish, conversation, practice, and candidate APIs without topicId when two topics exist', async () => {
    await expect(
      resolvePersonalLearningRequestActor('service', enrollmentId, 'learner-1'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const base = `/api/services/service/ai-training/enrollments/${enrollmentId}/learning-request`;
    const responses = [];
    responses.push(await personalLearningRequestResponse(request(base), 'service', enrollmentId));
    responses.push(
      await personalLearningConversationResponse(
        request(`${base}/conversation`, 'POST', {
          requestId: enrollmentId,
          requestRevision: 1,
          operationId: '00000000-0000-4000-8000-000000000005',
          text: '続けたいです',
        }),
        'service',
        enrollmentId,
      ),
    );
    responses.push(
      await learningPracticeResponse(request(`${base}/practice`), 'service', enrollmentId),
    );
    responses.push(
      await learningCandidateResponse(request(`${base}/candidate`), 'service', enrollmentId),
    );

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    for (const response of responses)
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(f.topicList).not.toHaveBeenCalled();
    expect(f.topicCreate).not.toHaveBeenCalled();
    expect(f.sendConversation).not.toHaveBeenCalled();
    expect(f.prepareLesson).not.toHaveBeenCalled();
  });

  it('keeps the explicit topic list and create APIs available without a selected topic', async () => {
    const endpoint = `/api/services/service/ai-training/enrollments/${enrollmentId}/topics`;
    const listed = await personalLearningTopicsResponse(request(endpoint), 'service', enrollmentId);
    expect(listed.status, await listed.clone().text()).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({ data: [{ id: topicA }, { id: topicB }] });

    const created = await personalLearningTopicsResponse(
      request(endpoint, 'POST', { title: '新しいテーマ' }),
      'service',
      enrollmentId,
    );
    expect(created.status).toBe(200);
    expect(f.topicCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'learner-1', programEnrollmentId: enrollmentId }),
      { title: '新しいテーマ' },
    );
  });
});
