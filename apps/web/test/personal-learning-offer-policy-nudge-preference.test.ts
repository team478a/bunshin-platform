import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const f = vi.hoisted(() => ({
  enrollment: vi.fn(),
  program: vi.fn(),
  consent: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: vi.fn().mockResolvedValue({
    getCurrentUser: vi.fn().mockResolvedValue({ userId: 'user' }),
  }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: vi.fn() }));
vi.mock('../src/services/personal-learning-request-access', () => ({
  resolvePersonalLearningRequestActor: vi.fn().mockResolvedValue({
    actorUserId: 'user',
    scope: {
      workspaceId: 'workspace',
      groupId: 'group',
      programEnrollmentId: '00000000-0000-4000-8000-000000000001',
      groupMembershipId: 'membership',
      userId: 'user',
    },
  }),
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    programEnrollment: { findFirst: f.enrollment },
    serviceProgram: { findFirst: f.program },
    aiTrainingUsageConsent: { findFirst: f.consent },
  },
  PrismaPersonalLearningNudgePreferenceRepository: class {
    update = f.update;
  },
}));

import { personalLearningNudgePreferenceResponse } from '../src/http/personal-learning-nudge-preference';

describe('invalid offer policy nudge preference boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.enrollment.mockResolvedValue({ serviceProgramId: 'program' });
    f.program.mockResolvedValue({
      settings: { moduleKey: 'AI_TRAINING_V1', learningOfferPolicy: 'UNKNOWN_POLICY' },
    });
  });

  it('refuses preference persistence before consent lookup', async () => {
    const response = await personalLearningNudgePreferenceResponse(
      new Request('https://example.test/preference', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'ENABLE', accepted: true }),
      }),
      'service',
      '00000000-0000-4000-8000-000000000001',
    );

    expect(response.status).toBe(404);
    expect(f.consent).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });
});
