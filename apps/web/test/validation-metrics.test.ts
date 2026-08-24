import type { ValidationMetricsSnapshot } from '@bunshin/application';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface TestState {
  user: { userId: string } | null;
  inaccessible: boolean;
  summarize: ReturnType<typeof vi.fn>;
}
const state = vi.hoisted<TestState>(() => ({
  user: { userId: 'owner-1' },
  inaccessible: false,
  summarize: vi.fn(),
}));
const period = { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-09-01T00:00:00Z') };
const snapshot = {
  period,
  funnel: {
    registrations: 2,
    bunshinCreations: 1,
    socialActivations: 1,
    strategyCompletions: 1,
    strategyApprovals: 1,
    firstMissionViews: 1,
    missionAcceptances: 1,
    copies: 1,
    posts: 1,
    d7ActiveUsers: 1,
  },
  outcomes: {
    postedUsers: 1,
    postCount: 3,
    feedbackCount: 1,
    goodFeedbackCount: 1,
    goodFeedbackRate: 1,
    threePostsInFirstSevenDaysUsers: 1,
    eligibleFirstSevenDayUsers: 1,
    threePostsInFirstSevenDaysRate: 1,
    d7EligibleUsers: 1,
    d7ActiveRate: 1,
    aiCalls: 5,
    aiSuccessfulCalls: 4,
    aiFailedCalls: 1,
    aiInputTokens: 1000,
    aiOutputTokens: 500,
    aiPricedCalls: 0,
    aiEstimatedCostUsdMicros: null,
  },
  assistanceLevels: [
    {
      level: 'READY_TO_USE',
      missions: 1,
      viewed: 1,
      accepted: 1,
      copied: 1,
      posted: 1,
      feedback: 1,
      goodFeedback: 1,
      acceptanceRate: 1,
      copyRate: 1,
      postRate: 1,
      goodFeedbackRate: 1,
    },
  ],
} satisfies ValidationMetricsSnapshot;

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaValidationMetricsRepository: class {
    summarize = state.summarize;
  },
}));

import { getValidationMetricsResponse } from '../src/http/validation-metrics';

describe('validation metrics HTTP contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.user = { userId: 'owner-1' };
    state.inaccessible = false;
    state.summarize.mockResolvedValue(snapshot);
  });

  it('returns aggregate-only, no-store data', async () => {
    const response = await getValidationMetricsResponse(
      new Request(
        'http://localhost/api/workspaces/workspace-1/validation-metrics?from=2026-08-01&to=2026-09-01',
      ),
      'workspace-1',
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body.data.funnel.registrations).toBe(2);
    expect(body.data.assistanceLevels[0]).toMatchObject({
      level: 'READY_TO_USE',
      postRate: 1,
    });
    expect(JSON.stringify(body)).not.toMatch(/email|displayName|contentJson|postUrl/);
    expect(state.summarize).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'workspace-1', actorUserId: 'owner-1' }),
    );
  });

  it('requires a session and hides inaccessible workspaces', async () => {
    state.user = null;
    let response = await getValidationMetricsResponse(
      new Request('http://localhost/a?from=2026-08-01&to=2026-09-01'),
      'workspace-1',
    );
    expect(response.status).toBe(401);
    state.user = { userId: 'member-1' };
    state.inaccessible = true;
    state.summarize.mockResolvedValue(null);
    response = await getValidationMetricsResponse(
      new Request('http://localhost/a?from=2026-08-01&to=2026-09-01'),
      'workspace-1',
    );
    expect(response.status).toBe(404);
  });

  it('rejects malformed or unknown query fields', async () => {
    const response = await getValidationMetricsResponse(
      new Request('http://localhost/a?from=2026-08-01&to=2026-09-01&userId=other'),
      'workspace-1',
    );
    expect(response.status).toBe(400);
  });
});
