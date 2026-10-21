import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

vi.mock('server-only', () => ({}));

const f = vi.hoisted(() => ({
  resolveActor: vi.fn(),
  conversationProviderPath: vi.fn(),
  supportProviderPath: vi.fn(),
  inboxUpdate: vi.fn(),
  outboxUpsert: vi.fn(),
  outboxUpdate: vi.fn(),
  push: vi.fn(),
}));

const enrollmentId = '00000000-0000-4000-8000-000000000001';
const inboxId = '00000000-0000-4000-8000-000000000002';
const settings = {
  moduleKey: 'AI_TRAINING_V1',
  learningOfferPolicy: 'UNKNOWN_POLICY',
  personalLearningPilot: {
    enabled: true,
    enrollmentIds: [enrollmentId],
    learningMode: 'DYNAMIC_V1',
    learningFeatures: {
      conversation: true,
      multiTopic: false,
      lineLearning: true,
      extendedScope: false,
    },
  },
};

vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.test' }),
}));
vi.mock('../src/line/secure-configuration', () => ({
  currentLineEnvironment: () => 'PRODUCTION',
  AesGcmLineSecretCrypto: class {
    decrypt() {
      return 'token';
    }
  },
}));
vi.mock('../src/line/messaging-provider', () => ({
  LineMessagingApiAdapter: class {
    getQuota = vi.fn().mockResolvedValue({ ok: true, limit: 100, consumption: 0 });
    pushText = f.push;
  },
}));
vi.mock('../src/services/personal-learning-request-access', () => ({
  resolvePersonalLearningRequestActor: f.resolveActor,
}));
vi.mock('../src/services/personal-learning-conversation', () => ({
  sendPersonalLearningConversationTurn: f.conversationProviderPath,
}));
vi.mock('../src/services/personal-learning-practice-support', () => ({
  requestPracticeSupport: f.supportProviderPath,
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    personalLearningLineInbox: {
      findFirst: vi.fn().mockResolvedValue({
        id: inboxId,
        status: 'PENDING',
        configurationId: 'config',
        workspaceId: 'workspace',
        groupId: 'group',
        groupMembershipId: 'membership',
        userId: 'user',
        programEnrollmentId: enrollmentId,
        messageType: 'TEXT',
        text: '相談',
        topicId: null,
        operationId: '00000000-0000-4000-8000-000000000003',
        providerEventId: 'event',
      }),
      updateMany: f.inboxUpdate,
    },
    groupLineConnection: {
      findFirst: vi.fn().mockResolvedValue({ providerUserId: 'line-user' }),
    },
    programEnrollment: {
      findFirst: vi.fn().mockResolvedValue({ id: enrollmentId, serviceProgramId: 'program' }),
    },
    groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'membership' }) },
    groupLineChannelConfiguration: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'config',
        environment: 'PRODUCTION',
        createdByUserId: 'operator',
        encryptedAccessToken: 'encrypted',
        quotaWarningPercent: 80,
        quotaLowPriorityStop: 90,
        group: { serviceConfiguration: { slug: 'service' } },
      }),
    },
    serviceProgram: { findFirst: vi.fn().mockResolvedValue({ settings }) },
    personalLearningLinePush: { upsert: f.outboxUpsert, update: f.outboxUpdate },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

import { executePersonalLearningLineJob } from '../src/jobs/personal-learning-line-job-handler';

describe('invalid offer policy LINE job boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.resolveActor.mockRejectedValue(
      new ApplicationError('NOT_FOUND', 'learning request unavailable'),
    );
    f.outboxUpsert.mockResolvedValue({
      id: 'outbox',
      status: 'PENDING',
      text: '続きはWebの研修画面から確認してください。',
      retryKey: 'retry',
    });
    f.push.mockResolvedValue({ ok: true });
  });

  it('does not reach conversation or support Providers after access rejection', async () => {
    const result = await executePersonalLearningLineJob({
      id: 'job',
      environment: 'PRODUCTION',
      workspaceId: 'workspace',
      jobType: 'PERSONAL_LEARNING_LINE_PROCESS',
      payloadReference: `personal-learning-line:${inboxId}`,
      idempotencyKey: 'job-key',
      correlationId: 'correlation',
      requestedBy: 'user',
      priority: 70,
      maxAttempts: 5,
      attemptCount: 1,
      status: 'RUNNING',
      scheduledAt: new Date(),
      lockedAt: new Date(),
      lockedBy: 'worker',
      lastErrorCode: null,
      lastErrorMessage: null,
      completedAt: null,
      failedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    expect(result).toEqual({ retryable: false });
    expect(f.conversationProviderPath).not.toHaveBeenCalled();
    expect(f.supportProviderPath).not.toHaveBeenCalled();
  });
});
