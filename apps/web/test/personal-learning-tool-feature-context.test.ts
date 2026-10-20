import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonalLearningActor, SavedPersonalLearningRequest } from '@bunshin/application';
import { loadPersonalLearningToolFeatureContext } from '../src/services/personal-learning-tool-feature-context';
import { personalLearningDynamicProgramAllows } from '@bunshin/capability-training';

const ids = {
  user: '11111111-1111-4111-8111-111111111111',
  workspace: '22222222-2222-4222-8222-222222222222',
  group: '33333333-3333-4333-8333-333333333333',
  enrollment: '44444444-4444-4444-8444-444444444444',
  membership: '55555555-5555-4555-8555-555555555555',
  topic: '66666666-6666-4666-8666-666666666666',
};
const actor: PersonalLearningActor = {
  actorUserId: ids.user,
  topicId: ids.topic,
  scope: {
    workspaceId: ids.workspace,
    groupId: ids.group,
    programEnrollmentId: ids.enrollment,
    groupMembershipId: ids.membership,
    userId: ids.user,
  },
};
const request: SavedPersonalLearningRequest = {
  id: '77777777-7777-4777-8777-777777777777',
  revision: 1,
  originalText: 'ChatGPTを使って案内文を改善したい',
  deviceType: 'PC',
  toolDescription: 'ChatGPT',
  experienceDescription: null,
  currentPosition: null,
  createdAt: new Date('2026-10-20T00:00:00.000Z').toISOString(),
};
const settings = {
  moduleKey: 'AI_TRAINING_V1',
  trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
  personalLearningPilot: {
    enabled: true,
    enrollmentIds: [ids.enrollment],
    learningMode: 'DYNAMIC_V1',
    learningFeatures: {
      conversation: false,
      multiTopic: true,
      lineLearning: false,
      extendedScope: false,
      learningNudges: false,
      toolUpdates: true,
    },
  },
};
const mocks = vi.hoisted(() => ({
  enrollment: vi.fn(),
  program: vi.fn(),
  topic: vi.fn(),
  updates: vi.fn(),
}));
const db = {
  prisma: {
    programEnrollment: { findFirst: mocks.enrollment },
    serviceProgram: { findFirst: mocks.program },
    personalLearningTopic: { findFirst: mocks.topic },
    personalLearningToolFeatureUpdate: { findMany: mocks.updates },
  },
} as unknown as typeof import('@bunshin/database');

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enrollment.mockResolvedValue({ id: ids.enrollment, serviceProgramId: 'program-id' });
  mocks.program.mockResolvedValue({ settings });
  mocks.topic.mockResolvedValue({
    id: ids.topic,
    title: '仕事の案内文を改善',
    goalSnapshot: { goal: '読みやすくする' },
  });
  mocks.updates.mockResolvedValue([
    {
      title: 'ChatGPTの公式新機能',
      summary: '案内文の改善に活用できる更新情報です。',
      sourceTitle: 'OpenAI公式',
      sourceUrl: 'https://openai.com/index/example',
    },
  ]);
});

describe('approved AI-tool update context', () => {
  it('does not read the new catalog unless the exact dynamic Program feature is ON', async () => {
    mocks.program.mockResolvedValue({
      settings: {
        ...settings,
        personalLearningPilot: {
          ...settings.personalLearningPilot,
          learningFeatures: {
            ...settings.personalLearningPilot.learningFeatures,
            toolUpdates: false,
          },
        },
      },
    });
    expect(await loadPersonalLearningToolFeatureContext(db, actor, request)).toEqual({
      sources: [],
      topicTitle: '',
      topicGoal: null,
    });
    expect(mocks.updates).not.toHaveBeenCalled();
    expect(mocks.topic).not.toHaveBeenCalled();
  });

  it('uses only a declared supported tool, an owned active topic, and bounded approved sources', async () => {
    expect(personalLearningDynamicProgramAllows(settings, ids.enrollment)).toBe(true);
    const result = await loadPersonalLearningToolFeatureContext(db, actor, request);
    expect(mocks.enrollment).toHaveBeenCalledWith({
      where: {
        workspaceId: ids.workspace,
        groupId: ids.group,
        id: ids.enrollment,
        groupMembershipId: ids.membership,
        status: 'ACTIVE',
      },
      select: { id: true, serviceProgramId: true },
    });
    expect(mocks.topic).toHaveBeenCalledWith({
      where: { ...actor.scope, id: ids.topic, status: 'ACTIVE' },
      select: { id: true, title: true, goalSnapshot: true },
    });
    expect(mocks.updates).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { toolKey: 'CHATGPT', status: 'APPROVED', expiresAt: { gt: expect.any(Date) } },
        take: 3,
      }),
    );
    expect(result).toEqual({
      sources: [
        {
          title: 'ChatGPTの公式新機能',
          summary: '案内文の改善に活用できる更新情報です。',
          sourceTitle: 'OpenAI公式',
          sourceUrl: 'https://openai.com/index/example',
        },
      ],
      topicTitle: '仕事の案内文を改善',
      topicGoal: '{"goal":"読みやすくする"}',
    });
  });

  it('does not query the catalog without a selected topic or a recognized declared tool', async () => {
    const actorWithoutTopic: PersonalLearningActor = {
      actorUserId: actor.actorUserId,
      scope: actor.scope,
    };
    await loadPersonalLearningToolFeatureContext(db, actorWithoutTopic, request);
    await loadPersonalLearningToolFeatureContext(db, actor, {
      ...request,
      toolDescription: 'AIチャット',
    });
    expect(mocks.updates).not.toHaveBeenCalled();
  });
});
