import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const fake = vi.hoisted(() => ({
  programs: vi.fn(),
  enrollments: vi.fn(),
  membership: vi.fn(),
  consent: vi.fn(),
  generate: vi.fn(),
  environment: {
    APP_ENV: 'production',
    CRON_SECRET: 'n'.repeat(32),
    APP_URL: 'https://example.test',
  },
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => fake.environment }));
vi.mock('@bunshin/database', () => ({
  prisma: {
    serviceProgram: { findMany: fake.programs },
    programEnrollment: { findMany: fake.enrollments },
    groupMembership: { findFirst: fake.membership },
    aiTrainingUsageConsent: { findFirst: fake.consent },
  },
}));
vi.mock('../src/services/personal-learning-nudge-ai', () => ({
  generatePersonalLearningNudgeCopy: fake.generate,
}));

import { personalLearningNudgesCronResponse } from '../src/http/personal-learning-nudges-cron';

const source = readFileSync(
  new URL('../src/http/personal-learning-nudges-cron.ts', import.meta.url),
  'utf8',
);
const request = (authorization = `Bearer ${fake.environment.CRON_SECRET}`) =>
  new Request('https://example.test/api/internal/ai-training/learning-nudges', {
    headers: { authorization },
  });

describe('N-1 fixed LINE learning nudges cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.environment.APP_ENV = 'production';
    fake.programs.mockResolvedValue([]);
  });

  it('requires cron authentication before scanning Programs', async () => {
    const response = await personalLearningNudgesCronResponse(request('Bearer invalid'));
    expect(response.status).toBe(401);
    expect(fake.programs).not.toHaveBeenCalled();
  });

  it('does nothing when there are no active nudge-enabled Programs', async () => {
    const response = await personalLearningNudgesCronResponse(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: 'COMPLETED', scanned: 0, sent: 0 });
  });

  it('skips an invalid offer policy before consent lookup or AI generation', async () => {
    const enrollmentId = '00000000-0000-4000-8000-000000000001';
    fake.programs.mockResolvedValue([
      {
        id: 'program',
        workspaceId: 'workspace',
        groupId: 'group',
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
              learningNudges: true,
              toolUpdates: false,
            },
          },
        },
      },
    ]);
    fake.enrollments.mockResolvedValue([
      {
        id: enrollmentId,
        workspaceId: 'workspace',
        groupId: 'group',
        groupMembershipId: 'membership',
        serviceProgramId: 'program',
        startsAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    ]);
    fake.membership.mockResolvedValue({ id: 'membership', userId: 'user' });

    const response = await personalLearningNudgesCronResponse(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scanned: 1, sent: 0, skipped: 1 });
    expect(fake.consent).not.toHaveBeenCalled();
    expect(fake.generate).not.toHaveBeenCalled();
  });

  it('keeps N-1 fixed copy as the fallback when the N-2 AI attempt is unavailable', () => {
    expect(source).toContain('personalLearningNudgeCopy(decision.situation, decision.ordinal)');
    expect(source).toContain('personalLearningNudgeQuickReplies(enrollment.id)');
    expect(source).toContain('generatePersonalLearningNudgeCopy');
    expect(source).toContain('personalLearningNudgeDeliveryMessage');
    expect(source).toContain('fixedCopy: outbox.text');
  });
});
