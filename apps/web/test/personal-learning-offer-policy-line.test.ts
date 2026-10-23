import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const f = vi.hoisted(() => ({
  consent: vi.fn(),
  inbox: vi.fn(),
  job: vi.fn(),
  event: vi.fn(),
  seat: vi.fn(),
}));

const enrollmentId = '00000000-0000-4000-8000-000000000001';
const tx = {
  groupLineChannelConfiguration: { findFirst: vi.fn().mockResolvedValue({ id: 'config' }) },
  groupLineWebhookEvent: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: f.event,
  },
  groupLineConnection: {
    findFirst: vi.fn().mockResolvedValue({
      id: 'connection',
      userId: 'user',
      groupMembershipId: 'membership',
    }),
  },
  programEnrollment: {
    findFirst: vi.fn().mockResolvedValue({ id: enrollmentId, serviceProgramId: 'program' }),
  },
  serviceProgram: {
    findFirst: vi.fn().mockResolvedValue({
      settings: {
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
      },
    }),
  },
  aiTrainingUsageConsent: { findFirst: f.consent },
  personalLearningLineInbox: { create: f.inbox },
  job: { create: f.job },
};

vi.mock('@bunshin/database', () => ({
  prisma: { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) },
  requirePersonalLearningPilotSeat: f.seat,
}));

import { PrismaGroupLineLearningInbox } from '../src/line/webhook';

describe('invalid offer policy LINE boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.seat.mockResolvedValue(undefined);
  });

  it('rejects consent matching and does not enqueue LINE learning work', async () => {
    await new PrismaGroupLineLearningInbox().persist({
      environment: 'PRODUCTION',
      workspaceId: 'workspace',
      groupId: 'group',
      configurationId: 'config',
      events: [
        {
          providerEventId: 'event',
          providerUserId: 'line-user',
          occurredAt: new Date('2026-10-21T00:00:00.000Z'),
          message: { type: 'TEXT', text: '相談' },
        },
      ],
    });

    expect(f.consent).not.toHaveBeenCalled();
    expect(f.inbox).not.toHaveBeenCalled();
    expect(f.job).not.toHaveBeenCalled();
    expect(f.event).toHaveBeenCalledWith({
      data: expect.objectContaining({ outcome: 'CONNECTION_NOT_FOUND' }),
    });
  });
});
