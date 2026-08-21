import type { BunshinCapabilityAssignment } from '@bunshin/application';
import type { DailyMission } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const now = new Date('2026-08-20T00:00:00.000Z');
const missionId = '11111111-1111-4111-8111-111111111111';
const mission: DailyMission = {
  id: missionId,
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  socialProfileId: null,
  weeklyPlanItemId: null,
  missionDate: '2026-08-20',
  status: 'GENERATED',
  format: 'TEXT',
  estimatedMinutes: 5,
  topic: '今日の一歩',
  angle: '初心者向け',
  reason: '最初の投稿に適しているため',
  qualityScore: 90,
  viewedAt: null,
  startedAt: null,
  completedAt: null,
  skippedAt: null,
  expiredAt: null,
  createdAt: now,
  updatedAt: now,
  content: {
    body: '今日から始める一歩',
    threadParts: [],
    cta: '保存してください',
    caption: null,
    hashtags: [],
  },
};
const assignment: BunshinCapabilityAssignment = {
  id: 'assignment-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  capabilityType: 'SOCIAL',
  status: 'ACTIVE',
  config: {},
  assignedByUserId: 'user-1',
  activatedAt: now,
  createdAt: now,
  updatedAt: now,
};
interface TestState {
  user: { userId: string } | null;
  assignmentStatus: 'MISSING' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
  inaccessible: boolean;
  create: ReturnType<typeof vi.fn>;
  transition: ReturnType<typeof vi.fn>;
}
const state = vi.hoisted<TestState>(() => ({
  user: { userId: 'user-1' },
  assignmentStatus: 'ACTIVE',
  inaccessible: false,
  create: vi.fn(),
  transition: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaBunshinCapabilityAssignmentRepository: class {
    find() {
      return Promise.resolve(
        state.assignmentStatus === 'MISSING'
          ? null
          : { ...assignment, status: state.assignmentStatus },
      );
    }
  },
  PrismaDailyMissionRepository: class {
    create = state.create;
    transition = state.transition;
    list() {
      return Promise.resolve(state.inaccessible ? null : [mission]);
    }
    find(input: { dailyMissionId: string }) {
      return Promise.resolve(
        state.inaccessible || input.dailyMissionId !== missionId ? null : mission,
      );
    }
  },
}));

import {
  createDailyMissionResponse,
  generateDailyMissionResponse,
  getDailyMissionResponse,
  listDailyMissionsResponse,
  transitionDailyMissionResponse,
} from '../src/http/daily-missions';

const base = '/api/workspaces/workspace-1/bunshins/bunshin-1/daily-missions';
function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: { origin: 'http://localhost:3000', ...init?.headers },
  });
}
function json(body: unknown) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
const createBody = {
  missionDate: '2026-08-20',
  format: 'TEXT',
  estimatedMinutes: 5,
  topic: '今日の一歩',
  angle: '初心者向け',
  reason: '最初の投稿に適しているため',
  qualityScore: 90,
  content: mission.content,
};

describe('authenticated Daily Mission HTTP contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('LOG_LEVEL', 'info');
    state.user = { userId: 'user-1' };
    state.assignmentStatus = 'ACTIVE';
    state.inaccessible = false;
    state.create.mockResolvedValue(mission);
    state.transition.mockResolvedValue({ ...mission, status: 'VIEWED' });
  });

  it('rejects duplicate generated dates before any new aggregate is persisted', async () => {
    const response = await generateDailyMissionResponse(
      request(
        `${base}/generate`,
        json({
          missionDate: mission.missionDate,
          timezone: 'Asia/Tokyo',
          socialProfileId: '22222222-2222-4222-8222-222222222222',
          idempotencyKey: '33333333-3333-4333-8333-333333333333',
        }),
      ),
      'workspace-1',
      'bunshin-1',
    );
    expect(response.status).toBe(409);
    expect(state.create).not.toHaveBeenCalled();
  });

  it('protects the generation endpoint before resolving AI context', async () => {
    const body = {
      missionDate: mission.missionDate,
      timezone: 'Asia/Tokyo',
      socialProfileId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    };
    state.user = null;
    expect(
      (
        await generateDailyMissionResponse(
          request(`${base}/generate`, json(body)),
          'workspace-1',
          'bunshin-1',
        )
      ).status,
    ).toBe(401);
    state.user = { userId: 'user-1' };
    state.assignmentStatus = 'SUSPENDED';
    expect(
      (
        await generateDailyMissionResponse(
          request(`${base}/generate`, json(body)),
          'workspace-1',
          'bunshin-1',
        )
      ).status,
    ).toBe(403);
    state.assignmentStatus = 'ACTIVE';
    state.inaccessible = true;
    expect(
      (
        await generateDailyMissionResponse(
          request(`${base}/generate`, json(body)),
          'other-workspace',
          'bunshin-1',
        )
      ).status,
    ).toBe(404);
    state.inaccessible = false;
    expect(
      (
        await generateDailyMissionResponse(
          request(`${base}/generate`, json({ ...body, actorUserId: 'attacker' })),
          'workspace-1',
          'bunshin-1',
        )
      ).status,
    ).toBe(400);
    const hostile = new Request(`http://localhost:3000${base}/generate`, {
      ...json(body),
      headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
    });
    expect((await generateDailyMissionResponse(hostile, 'workspace-1', 'bunshin-1')).status).toBe(
      403,
    );
  });

  it('returns scoped no-store DTOs and ISO timestamps', async () => {
    const response = await listDailyMissionsResponse(
      request(`${base}?from=2026-08-01&to=2026-08-20`),
      'workspace-1',
      'bunshin-1',
    );
    const body = (await response.json()) as { data: Array<Record<string, unknown>> };
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.data[0]).toMatchObject({
      missionDate: '2026-08-20',
      createdAt: now.toISOString(),
      content: expect.objectContaining({ body: '今日から始める一歩' }),
    });
  });

  it('rejects unauthenticated and cross-scope reads', async () => {
    state.user = null;
    expect(
      (await listDailyMissionsResponse(request(base), 'workspace-1', 'bunshin-1')).status,
    ).toBe(401);
    state.user = { userId: 'user-1' };
    state.inaccessible = true;
    expect(
      (await listDailyMissionsResponse(request(base), 'other-workspace', 'bunshin-1')).status,
    ).toBe(404);
  });

  it('creates with verified actor and rejects authority fields', async () => {
    expect(
      (
        await createDailyMissionResponse(
          request(base, json(createBody)),
          'workspace-1',
          'bunshin-1',
        )
      ).status,
    ).toBe(201);
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'user-1' }));
    expect(state.create.mock.calls[0]?.[0]).not.toHaveProperty('status');
    expect(
      (
        await createDailyMissionResponse(
          request(base, json({ ...createBody, actorUserId: 'attacker' })),
          'workspace-1',
          'bunshin-1',
        )
      ).status,
    ).toBe(400);
  });

  it.each([
    ['MISSING', 404],
    ['SUSPENDED', 403],
    ['LOCKED', 403],
  ] as const)('rejects mutation for %s but permits reads', async (status, expected) => {
    state.assignmentStatus = status;
    expect(
      (
        await transitionDailyMissionResponse(
          request(`${base}/${missionId}/started`, json({})),
          'workspace-1',
          'bunshin-1',
          missionId,
          'started',
        )
      ).status,
    ).toBe(expected);
    expect(
      (await listDailyMissionsResponse(request(base), 'workspace-1', 'bunshin-1')).status,
    ).toBe(200);
  });

  it('transitions explicitly and rejects invalid bodies, ids and origins', async () => {
    expect(
      (
        await transitionDailyMissionResponse(
          request(`${base}/${missionId}/viewed`, json({})),
          'workspace-1',
          'bunshin-1',
          missionId,
          'viewed',
        )
      ).status,
    ).toBe(200);
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'VIEWED', actorUserId: 'user-1' }),
    );
    expect(
      (
        await transitionDailyMissionResponse(
          request(`${base}/${missionId}/viewed`, json({ status: 'VIEWED' })),
          'workspace-1',
          'bunshin-1',
          missionId,
          'viewed',
        )
      ).status,
    ).toBe(400);
    expect(
      (await getDailyMissionResponse(request(`${base}/bad`), 'workspace-1', 'bunshin-1', 'bad'))
        .status,
    ).toBe(400);
    const hostile = new Request(`http://localhost:3000${base}`, {
      ...json(createBody),
      headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
    });
    expect((await createDailyMissionResponse(hostile, 'workspace-1', 'bunshin-1')).status).toBe(
      403,
    );
  });

  it('maps duplicate creation and invalid date ranges', async () => {
    state.create.mockRejectedValueOnce(new ApplicationError('CONFLICT', 'duplicate'));
    expect(
      (
        await createDailyMissionResponse(
          request(base, json(createBody)),
          'workspace-1',
          'bunshin-1',
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await listDailyMissionsResponse(
          request(`${base}?from=2026-01-01&to=2026-04-01`),
          'workspace-1',
          'bunshin-1',
        )
      ).status,
    ).toBe(400);
  });
});
