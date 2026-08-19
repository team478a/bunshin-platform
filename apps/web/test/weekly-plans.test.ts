import type { BunshinCapabilityAssignment } from '@bunshin/application';
import type { ContentPillar, WeeklyPlan } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const now = new Date('2026-08-19T00:00:00.000Z');
const planId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const pillarId = '33333333-3333-4333-8333-333333333333';
const assignment: BunshinCapabilityAssignment = {
  id: 'assignment-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  capabilityType: 'SOCIAL',
  status: 'ACTIVE',
  config: { private: true },
  assignedByUserId: 'user-1',
  activatedAt: now,
  createdAt: now,
  updatedAt: now,
};
const pillar: ContentPillar = {
  id: pillarId,
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  title: '教育',
  description: null,
  weight: 80,
  active: true,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
};
const plan: WeeklyPlan = {
  id: planId,
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  weekStartDate: '2026-08-17',
  timezone: 'Asia/Tokyo',
  strategySummary: '基礎',
  status: 'DRAFT',
  confirmedAt: null,
  expiredAt: null,
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: itemId,
      workspaceId: 'workspace-1',
      bunshinId: 'bunshin-1',
      weeklyPlanId: planId,
      scheduledDate: '2026-08-18',
      contentPillarId: pillarId,
      goal: '保存される基礎解説',
      angle: '最初の3手',
      recommendedFormat: 'SLIDE',
      notes: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
};

interface TestState {
  currentUser: { userId: string } | null;
  assignmentStatus: 'MISSING' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
  inaccessible: boolean;
  plans: WeeklyPlan[];
  createPlan: ReturnType<typeof vi.fn>;
  updatePlan: ReturnType<typeof vi.fn>;
  createItem: ReturnType<typeof vi.fn>;
  updateItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
  confirmPlan: ReturnType<typeof vi.fn>;
  expirePlan: ReturnType<typeof vi.fn>;
}

const state = vi.hoisted<TestState>(() => ({
  currentUser: { userId: 'user-1' },
  assignmentStatus: 'ACTIVE',
  inaccessible: false,
  plans: [] as WeeklyPlan[],
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  removeItem: vi.fn(),
  confirmPlan: vi.fn(),
  expirePlan: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve(state.currentUser) }),
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
  PrismaContentPillarRepository: class {
    create = vi.fn();
    update = vi.fn();
    setActive = vi.fn();
    softDelete = vi.fn();
    list() {
      return Promise.resolve(state.inaccessible ? null : [pillar]);
    }
    find() {
      return Promise.resolve(pillar);
    }
  },
  PrismaWeeklyPlanRepository: class {
    createPlan = state.createPlan;
    updatePlan = state.updatePlan;
    createItem = state.createItem;
    updateItem = state.updateItem;
    removeItem = state.removeItem;
    confirmPlan = state.confirmPlan;
    expirePlan = state.expirePlan;
    listPlans() {
      return Promise.resolve(state.inaccessible ? null : state.plans);
    }
    findPlan(input: { weeklyPlanId: string }) {
      return Promise.resolve(
        state.inaccessible
          ? null
          : (state.plans.find((value) => value.id === input.weeklyPlanId) ?? null),
      );
    }
  },
}));

import {
  createWeeklyPlanItemResponse,
  createWeeklyPlanResponse,
  deleteWeeklyPlanItemResponse,
  getWeeklyPlanResponse,
  listWeeklyPlansResponse,
  setWeeklyPlanStatusResponse,
  updateWeeklyPlanItemResponse,
  updateWeeklyPlanResponse,
} from '../src/http/weekly-plans';

const base = '/api/workspaces/workspace-1/bunshins/bunshin-1/weekly-plans';
function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: { origin: 'http://localhost:3000', ...init?.headers },
  });
}
function json(method: string, body: unknown) {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}
const itemBody = {
  scheduledDate: '2026-08-18',
  contentPillarId: pillarId,
  goal: '保存される基礎解説',
  angle: '最初の3手',
  recommendedFormat: 'SLIDE',
  notes: null,
};

describe('authenticated Weekly Plan HTTP contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('LOG_LEVEL', 'info');
    state.currentUser = { userId: 'user-1' };
    state.assignmentStatus = 'ACTIVE';
    state.inaccessible = false;
    state.plans = [plan];
    state.createPlan.mockResolvedValue(plan);
    state.updatePlan.mockResolvedValue(plan);
    state.createItem.mockResolvedValue(plan);
    state.updateItem.mockResolvedValue(plan);
    state.removeItem.mockResolvedValue(plan);
    state.confirmPlan.mockResolvedValue({ ...plan, status: 'CONFIRMED', confirmedAt: now });
    state.expirePlan.mockResolvedValue({ ...plan, status: 'EXPIRED', expiredAt: now });
  });

  it('returns no-store aggregates, local dates, pillar title, and ISO timestamps', async () => {
    const response = await listWeeklyPlansResponse(request(base), 'workspace-1', 'bunshin-1');
    const body = (await response.json()) as { data: Array<Record<string, unknown>> };
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.data[0]).toMatchObject({
      weekStartDate: '2026-08-17',
      createdAt: now.toISOString(),
      items: [
        expect.objectContaining({
          scheduledDate: '2026-08-18',
          contentPillarTitle: '教育',
          createdAt: now.toISOString(),
        }),
      ],
    });
    expect(JSON.stringify(body)).not.toContain('private');
  });

  it('rejects unauthenticated and inaccessible reads', async () => {
    state.currentUser = null;
    expect((await listWeeklyPlansResponse(request(base), 'workspace-1', 'bunshin-1')).status).toBe(
      401,
    );
    state.currentUser = { userId: 'user-1' };
    state.inaccessible = true;
    expect((await listWeeklyPlansResponse(request(base), 'workspace-1', 'bunshin-1')).status).toBe(
      404,
    );
  });

  it('creates plans/items at 201 and uses the verified actor', async () => {
    const created = await createWeeklyPlanResponse(
      request(
        base,
        json('POST', {
          weekStartDate: '2026-08-17',
          timezone: 'Asia/Tokyo',
          strategySummary: '基礎',
        }),
      ),
      'workspace-1',
      'bunshin-1',
    );
    expect(created.status).toBe(201);
    expect(state.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'user-1' }),
    );
    expect(
      (
        await createWeeklyPlanItemResponse(
          request(`${base}/${planId}/items`, json('POST', itemBody)),
          'workspace-1',
          'bunshin-1',
          planId,
        )
      ).status,
    ).toBe(201);
  });

  it('rejects authority fields, invalid ids, non-Monday dates, formats and empty updates', async () => {
    for (const body of [
      { weekStartDate: '2026-08-18', timezone: 'Asia/Tokyo' },
      { weekStartDate: '2026-08-17', timezone: 'Invalid/Zone' },
      { weekStartDate: '2026-08-17', timezone: 'Asia/Tokyo', actorUserId: 'attacker' },
      { weekStartDate: '2026-08-17', timezone: 'Asia/Tokyo', status: 'CONFIRMED' },
    ])
      expect(
        (
          await createWeeklyPlanResponse(
            request(base, json('POST', body)),
            'workspace-1',
            'bunshin-1',
          )
        ).status,
      ).toBe(400);
    expect(
      (await getWeeklyPlanResponse(request(`${base}/bad`), 'workspace-1', 'bunshin-1', 'bad'))
        .status,
    ).toBe(400);
    expect(
      (
        await updateWeeklyPlanItemResponse(
          request(`${base}/${planId}/items/${itemId}`, json('PATCH', {})),
          'workspace-1',
          'bunshin-1',
          planId,
          itemId,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await createWeeklyPlanItemResponse(
          request(
            `${base}/${planId}/items`,
            json('POST', { ...itemBody, recommendedFormat: 'UNKNOWN' }),
          ),
          'workspace-1',
          'bunshin-1',
          planId,
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
        await updateWeeklyPlanResponse(
          request(`${base}/${planId}`, json('PATCH', { strategySummary: '更新' })),
          'workspace-1',
          'bunshin-1',
          planId,
        )
      ).status,
    ).toBe(expected);
    expect((await listWeeklyPlansResponse(request(base), 'workspace-1', 'bunshin-1')).status).toBe(
      200,
    );
  });

  it('maps conflicts, enforces empty state bodies, idempotent actions, no DELETE body and origin', async () => {
    state.createPlan.mockRejectedValueOnce(new ApplicationError('CONFLICT', 'duplicate'));
    expect(
      (
        await createWeeklyPlanResponse(
          request(base, json('POST', { weekStartDate: '2026-08-17', timezone: 'Asia/Tokyo' })),
          'workspace-1',
          'bunshin-1',
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await setWeeklyPlanStatusResponse(
          request(`${base}/${planId}/confirm`, json('POST', {})),
          'workspace-1',
          'bunshin-1',
          planId,
          'confirm',
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await setWeeklyPlanStatusResponse(
          request(`${base}/${planId}/confirm`, json('POST', { status: 'CONFIRMED' })),
          'workspace-1',
          'bunshin-1',
          planId,
          'confirm',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await deleteWeeklyPlanItemResponse(
          request(`${base}/${planId}/items/${itemId}`, json('DELETE', {})),
          'workspace-1',
          'bunshin-1',
          planId,
          itemId,
        )
      ).status,
    ).toBe(400);
    const hostile = new Request(`http://localhost:3000${base}`, {
      ...json('POST', { weekStartDate: '2026-08-17', timezone: 'Asia/Tokyo' }),
      headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
    });
    expect((await createWeeklyPlanResponse(hostile, 'workspace-1', 'bunshin-1')).status).toBe(403);
  });
});
