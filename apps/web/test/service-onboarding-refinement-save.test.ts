import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  upsert: vi.fn(),
  membership: vi.fn(),
  reward: vi.fn(),
  service: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve({ userId: 'user-a' }) }),
}));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: state.service }));
vi.mock('@bunshin/application', () => ({
  ServiceReferralRewardService: class {
    completeMilestone = state.reward;
  },
}));
vi.mock('@bunshin/database', () => ({
  PrismaServiceReferralRewardRepository: class {},
  prisma: {
    groupMembership: { findFirst: state.membership },
    $transaction: (
      callback: (tx: {
        serviceOnboardingResponse: { upsert: typeof state.upsert };
      }) => Promise<unknown>,
    ) => callback({ serviceOnboardingResponse: { upsert: state.upsert } }),
  },
}));
import { saveServiceOnboardingResponse } from '../src/http/service-onboarding';

describe('saving onboarding refinement cooldown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    state.membership.mockResolvedValue({ id: 'membership-a' });
    state.service.mockResolvedValue({
      workspaceId: 'workspace-a',
      serviceId: 'group-a',
      configuration: {
        registration: { onboardingConfig: {}, surveyConfig: { questions: ['SNSは？'] } },
      },
    });
    state.upsert.mockResolvedValue({ id: 'response-a', completedAt: new Date() });
    state.reward.mockResolvedValue({});
  });
  afterEach(() => vi.useRealTimers());

  it('pauses new and edited responses for 24 hours without overwriting deferral history', async () => {
    const response = await saveServiceOnboardingResponse(
      new Request('http://localhost:3000/api/services/hassy/onboarding', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({ answers: ['X'] }),
      }),
      'hassy',
    );
    expect(response.status).toBe(201);
    const mutation = state.upsert.mock.calls[0]?.[0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    for (const data of [mutation.create, mutation.update]) {
      expect(data['nextRefinementAt']).toEqual(new Date('2026-09-29T12:00:00Z'));
      expect(data).not.toHaveProperty('refinementState');
      expect(data['answers']).toEqual([{ question: 'SNSは？', answer: 'X' }]);
    }
  });
});
