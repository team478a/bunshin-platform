import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('server-only', () => ({}));

const f = vi.hoisted(() => ({
  service: vi.fn(),
  membership: vi.fn(),
  programMany: vi.fn(),
  program: vi.fn(),
  enrollmentMany: vi.fn(),
  enrollment: vi.fn(),
  seatMany: vi.fn(),
  consentMany: vi.fn(),
  consent: vi.fn(),
  upsert: vi.fn(),
}));

const transactionClient = {
  groupMembership: { findFirst: f.membership },
  programEnrollment: { findFirst: f.enrollment },
  serviceProgram: { findFirst: f.program },
  personalLearningPilotSeat: { findFirst: vi.fn() },
  aiTrainingUsageConsent: { upsert: f.upsert },
};

vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: f.service }));
vi.mock('@bunshin/database', () => ({
  prisma: {
    groupMembership: { findFirst: f.membership },
    serviceProgram: { findMany: f.programMany, findFirst: f.program },
    programEnrollment: { findMany: f.enrollmentMany, findFirst: f.enrollment },
    personalLearningPilotSeat: { findMany: f.seatMany, findFirst: vi.fn() },
    aiTrainingUsageConsent: { findMany: f.consentMany, findFirst: f.consent },
    $transaction: (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient),
  },
  trainingEnrollmentPeriodWhere: () => ({}),
}));

import {
  AI_TRAINING_AI_CONSENT_TEXT,
  AI_TRAINING_AI_CONSENT_VERSION,
  aiTrainingConsentTextDigest,
  readAiTrainingParticipation,
  recordAiTrainingUsageConsent,
  requireAiTrainingUsageConsent,
} from '../src/services/ai-training-consent';

const trainingPage = readFileSync(
  new URL('../app/s/[serviceSlug]/training/page.tsx', import.meta.url),
  'utf8',
);

const enrollmentId = '00000000-0000-4000-8000-000000000001';
const invalidSettings = {
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

describe('invalid offer policy consent boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.service.mockResolvedValue({
      workspaceId: 'workspace',
      serviceId: 'group',
      configuration: { displayName: 'service' },
    });
    f.membership.mockResolvedValue({ id: 'membership' });
    f.enrollment.mockResolvedValue({
      id: enrollmentId,
      serviceProgramId: 'program',
      groupMembershipId: 'membership',
    });
    f.program.mockResolvedValue({ settings: invalidSettings });
  });

  it('does not expose consent text for an invalid-policy Program', async () => {
    f.programMany.mockResolvedValue([
      { id: 'program', displayName: 'program', status: 'ACTIVE', settings: invalidSettings },
    ]);

    const participation = await readAiTrainingParticipation('service', 'user');

    expect(participation.enrollments).toEqual([]);
    expect(JSON.stringify(participation)).not.toContain('研修の回答や学習内容');
    expect(f.enrollmentMany).not.toHaveBeenCalled();
    expect(f.consentMany).not.toHaveBeenCalled();
    expect(trainingPage).toContain(
      "enrollment.state === 'CONSENT_REQUIRED' && enrollment.consentText",
    );
    expect(trainingPage).not.toContain('?? AI_TRAINING_AI_CONSENT_TEXT');
  });

  it('matches each enrollment consent against its Program policy version and text digest', async () => {
    const settings = { ...invalidSettings, learningOfferPolicy: 'AI_SKILL_V1' };
    f.programMany.mockResolvedValue([
      { id: 'program', displayName: 'program', status: 'ACTIVE', settings },
    ]);
    f.enrollmentMany.mockResolvedValue([
      {
        id: enrollmentId,
        serviceProgramId: 'program',
        startsAt: new Date('2026-10-01T00:00:00.000Z'),
        endsAt: null,
      },
    ]);
    f.seatMany.mockResolvedValue([
      { serviceProgramId: 'program', programEnrollmentId: enrollmentId },
    ]);
    f.consentMany.mockResolvedValue([
      {
        programEnrollmentId: enrollmentId,
        consentVersion: AI_TRAINING_AI_CONSENT_VERSION,
        textDigest: 'wrong-digest',
        consentedAt: new Date('2026-10-20T00:00:00.000Z'),
      },
    ]);

    const stale = await readAiTrainingParticipation('service', 'user');
    expect(stale.enrollments[0]).toMatchObject({ state: 'CONSENT_REQUIRED' });

    f.consentMany.mockResolvedValue([
      {
        programEnrollmentId: enrollmentId,
        consentVersion: AI_TRAINING_AI_CONSENT_VERSION,
        textDigest: aiTrainingConsentTextDigest(AI_TRAINING_AI_CONSENT_TEXT),
        consentedAt: new Date('2026-10-20T00:00:00.000Z'),
      },
    ]);
    const current = await readAiTrainingParticipation('service', 'user');
    expect(current.enrollments[0]).toMatchObject({ state: 'READY' });
  });

  it('refuses to save consent for an invalid-policy Program', async () => {
    await expect(
      recordAiTrainingUsageConsent({ serviceSlug: 'service', userId: 'user', enrollmentId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'training participation unavailable' });
    expect(f.upsert).not.toHaveBeenCalled();
  });

  it('refuses required-consent matching before reading consent', async () => {
    await expect(
      requireAiTrainingUsageConsent({
        workspaceId: 'workspace',
        groupId: 'group',
        enrollmentId,
        userId: 'user',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'AI training consent required' });
    expect(f.consent).not.toHaveBeenCalled();
  });
});
