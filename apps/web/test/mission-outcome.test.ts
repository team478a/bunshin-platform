import type { BunshinCapabilityAssignment } from '@bunshin/application';
import type {
  DailyMission,
  MissionActivity,
  MissionFeedback,
  PostRecord,
} from '@bunshin/capability-social';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const now = new Date('2026-08-20T04:00:00Z');
const missionId = '11111111-1111-4111-8111-111111111111';
const post: PostRecord = {
  id: 'post-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  dailyMissionId: missionId,
  actorUserId: 'user-1',
  platform: 'X',
  postedAt: now,
  postUrl: null,
  externalPostId: null,
  source: 'MANUAL',
  manualMetrics: null,
  idempotencyKey: 'post-1',
  createdAt: now,
  updatedAt: now,
};
const feedback: MissionFeedback = {
  id: 'feedback-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  dailyMissionId: missionId,
  actorUserId: 'user-1',
  rating: 'GOOD',
  createdAt: now,
  updatedAt: now,
};
const activity = {
  id: 'activity-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  dailyMissionId: missionId,
  actorUserId: 'user-1',
  type: 'POSTED',
  occurredAt: now,
  idempotencyKey: 'post-1',
  metadata: null,
  createdAt: now,
} as MissionActivity;
interface TestState {
  user: { userId: string } | null;
  inaccessible: boolean;
  status: 'ACTIVE' | 'SUSPENDED';
  recordPost: ReturnType<typeof vi.fn>;
  recordFeedback: ReturnType<typeof vi.fn>;
}
const state = vi.hoisted<TestState>(() => ({
  user: { userId: 'user-1' },
  inaccessible: false,
  status: 'ACTIVE',
  recordPost: vi.fn(),
  recordFeedback: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaDailyMissionRepository: class {
    find() {
      return Promise.resolve({ id: missionId } as DailyMission);
    }
  },
  PrismaBunshinCapabilityAssignmentRepository: class {
    find() {
      return Promise.resolve({ status: state.status } as BunshinCapabilityAssignment);
    }
  },
  PrismaMissionOutcomeRepository: class {
    getPost() {
      return Promise.resolve(state.inaccessible ? null : post);
    }
    getFeedback() {
      return Promise.resolve(state.inaccessible ? null : feedback);
    }
    recordPost = state.recordPost;
    recordFeedback = state.recordFeedback;
  },
}));
import {
  getMissionFeedbackResponse,
  getPostRecordResponse,
  recordMissionFeedbackResponse,
  recordPostResponse,
} from '../src/http/mission-outcome';
const base = `http://localhost:3000/api/workspaces/workspace-1/bunshins/bunshin-1/daily-missions/${missionId}`;
function request(path: string, body?: unknown, origin = 'http://localhost:3000') {
  return new Request(
    `${base}/${path}`,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
}

describe('PostRecord / Feedback HTTP contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('LOG_LEVEL', 'info');
    state.user = { userId: 'user-1' };
    state.inaccessible = false;
    state.status = 'ACTIVE';
    state.recordPost.mockResolvedValue({ post, activity });
    state.recordFeedback.mockResolvedValue({
      feedback,
      activity: { ...activity, type: 'FEEDBACK_GOOD' },
    });
  });
  it('returns scoped no-store outcome DTOs', async () => {
    const response = await getPostRecordResponse(
      request('post-record'),
      'workspace-1',
      'bunshin-1',
      missionId,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).data.postedAt).toBe(now.toISOString());
    expect(
      (await getMissionFeedbackResponse(request('feedback'), 'workspace-1', 'bunshin-1', missionId))
        .status,
    ).toBe(200);
  });
  it('uses verified actor and strict post input', async () => {
    expect(
      (
        await recordPostResponse(
          request('post-record', { platform: 'X', idempotencyKey: 'post-1' }),
          'workspace-1',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(200);
    expect(state.recordPost).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'user-1', platform: 'X', postUrl: null }),
    );
    expect(
      (
        await recordPostResponse(
          request('post-record', {
            platform: 'X',
            idempotencyKey: 'post-2',
            externalPostId: 'forged',
          }),
          'workspace-1',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(400);
  });
  it('validates feedback and same-origin mutations', async () => {
    expect(
      (
        await recordMissionFeedbackResponse(
          request('feedback', { rating: 'GOOD', idempotencyKey: 'feedback-1' }),
          'workspace-1',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await recordMissionFeedbackResponse(
          request('feedback', { rating: 'GREAT', idempotencyKey: 'feedback-2' }),
          'workspace-1',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await recordPostResponse(
          request(
            'post-record',
            { platform: 'X', idempotencyKey: 'post-3' },
            'https://evil.example',
          ),
          'workspace-1',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(403);
  });
  it('blocks unauthenticated, cross-scope and suspended mutations', async () => {
    state.user = null;
    expect(
      (await getPostRecordResponse(request('post-record'), 'workspace-1', 'bunshin-1', missionId))
        .status,
    ).toBe(401);
    state.user = { userId: 'user-1' };
    state.inaccessible = true;
    expect(
      (
        await getMissionFeedbackResponse(
          request('feedback'),
          'other-workspace',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(404);
    state.inaccessible = false;
    state.status = 'SUSPENDED';
    expect(
      (
        await recordPostResponse(
          request('post-record', { platform: 'X', idempotencyKey: 'post-4' }),
          'workspace-1',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(403);
  });
});
