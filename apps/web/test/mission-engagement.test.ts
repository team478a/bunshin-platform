import type { BunshinCapabilityAssignment } from '@bunshin/application';
import type { DailyMission, MissionActivity, MissionDecision } from '@bunshin/capability-social';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const now = new Date('2026-08-20T00:00:00.000Z');
const missionId = '11111111-1111-4111-8111-111111111111';
const decision: MissionDecision = {
  id: 'decision-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  dailyMissionId: missionId,
  decision: 'PENDING',
  rejectionReason: null,
  rejectionDetail: null,
  decidedAt: null,
  createdAt: now,
  updatedAt: now,
};
const activity: MissionActivity = {
  id: 'activity-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  dailyMissionId: missionId,
  actorUserId: 'user-1',
  type: 'VIEWED',
  occurredAt: now,
  idempotencyKey: 'key-1',
  metadata: null,
  createdAt: now,
};
const mission = { id: missionId } as DailyMission;
const assignment = { status: 'ACTIVE' } as BunshinCapabilityAssignment;
interface TestState {
  user: { userId: string } | null;
  inaccessible: boolean;
  status: 'ACTIVE' | 'SUSPENDED';
  decide: ReturnType<typeof vi.fn>;
  append: ReturnType<typeof vi.fn>;
}
const state = vi.hoisted<TestState>(() => ({
  user: { userId: 'user-1' },
  inaccessible: false,
  status: 'ACTIVE',
  decide: vi.fn(),
  append: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaDailyMissionRepository: class {
    find() {
      return Promise.resolve(state.inaccessible ? null : mission);
    }
  },
  PrismaBunshinCapabilityAssignmentRepository: class {
    find() {
      return Promise.resolve({ ...assignment, status: state.status });
    }
  },
  PrismaMissionEngagementRepository: class {
    getDecision() {
      return Promise.resolve(state.inaccessible ? null : decision);
    }
    decide = state.decide;
    listActivities() {
      return Promise.resolve(state.inaccessible ? null : [activity]);
    }
    appendActivity = state.append;
  },
}));

import {
  decideMissionResponse,
  getMissionDecisionResponse,
  listMissionActivitiesResponse,
  recordMissionActivityResponse,
} from '../src/http/mission-engagement';
const base = `http://localhost:3000/api/workspaces/workspace-1/bunshins/bunshin-1/daily-missions/${missionId}`;
function request(path: string, body?: unknown) {
  return new Request(
    `${base}/${path}`,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
}

describe('Mission Decision / Activity HTTP contract', () => {
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
    state.decide.mockResolvedValue({
      decision: { ...decision, decision: 'ACCEPTED', decidedAt: now },
      activity: { ...activity, type: 'ACCEPTED' },
    });
    state.append.mockResolvedValue(activity);
  });
  it('returns scoped no-store decision and activities', async () => {
    const result = await getMissionDecisionResponse(
      request('decision'),
      'workspace-1',
      'bunshin-1',
      missionId,
    );
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    const list = await listMissionActivitiesResponse(
      request('activities'),
      'workspace-1',
      'bunshin-1',
      missionId,
    );
    expect(list.status).toBe(200);
    expect((await list.json()).data[0].occurredAt).toBe(now.toISOString());
  });
  it('uses verified actor and rejects authority fields', async () => {
    expect(
      (
        await decideMissionResponse(
          request('decision', { decision: 'ACCEPTED', idempotencyKey: 'accept-1' }),
          'workspace-1',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(200);
    expect(state.decide).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'user-1' }));
    expect(
      (
        await decideMissionResponse(
          request('decision', {
            decision: 'ACCEPTED',
            idempotencyKey: 'accept-2',
            actorUserId: 'other',
          }),
          'workspace-1',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(400);
  });
  it('validates rejection and strict activity metadata', async () => {
    expect(
      (
        await decideMissionResponse(
          request('decision', { decision: 'REJECTED', idempotencyKey: 'reject-1' }),
          'workspace-1',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await recordMissionActivityResponse(
          request('activities', {
            type: 'COPIED_TEXT',
            idempotencyKey: 'copy-1',
            metadata: { body: 'secret' },
          }),
          'workspace-1',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await recordMissionActivityResponse(
          request('activities', {
            type: 'COPIED_SLIDE',
            idempotencyKey: 'copy-2',
            metadata: { slideIndex: 2 },
          }),
          'workspace-1',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await recordMissionActivityResponse(
          request('activities', {
            type: 'COPIED_IMAGE_INSTRUCTION',
            idempotencyKey: 'copy-image-1',
          }),
          'workspace-1',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await recordMissionActivityResponse(
          request('activities', { type: 'CONFIRMED', idempotencyKey: 'confirm-1' }),
          'workspace-1',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await recordMissionActivityResponse(
          request('activities', { type: 'RESTED', idempotencyKey: 'rest-1' }),
          'workspace-1',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(200);
  });
  it('blocks unauthenticated, cross-scope and suspended mutations', async () => {
    state.user = null;
    expect(
      (await getMissionDecisionResponse(request('decision'), 'workspace-1', 'bunshin-1', missionId))
        .status,
    ).toBe(401);
    state.user = { userId: 'user-1' };
    state.inaccessible = true;
    expect(
      (
        await listMissionActivitiesResponse(
          request('activities'),
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
        await recordMissionActivityResponse(
          request('activities', { type: 'VIEWED', idempotencyKey: 'view-1' }),
          'workspace-1',
          'bunshin-1',
          missionId,
        )
      ).status,
    ).toBe(403);
  });
});
