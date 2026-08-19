import type { BunshinCapabilityAssignment } from '@bunshin/application';
import type { ContentPillar } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const now = new Date('2026-08-19T00:00:00.000Z');
const id = '11111111-1111-4111-8111-111111111111';
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
  id,
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  title: '教育',
  description: '基礎',
  weight: 80,
  active: true,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
};

const state = vi.hoisted<{
  currentUser: { userId: string } | null;
  assignmentStatus: 'MISSING' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
  inaccessible: boolean;
  values: ContentPillar[];
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  setActive: ReturnType<typeof vi.fn>;
  softDelete: ReturnType<typeof vi.fn>;
}>(() => ({
  currentUser: null,
  assignmentStatus: 'ACTIVE',
  inaccessible: false,
  values: [] as ContentPillar[],
  create: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
  softDelete: vi.fn(),
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
    create = state.create;
    update = state.update;
    setActive = state.setActive;
    softDelete = state.softDelete;
    list() {
      return Promise.resolve(state.inaccessible ? null : state.values);
    }
    find(input: { pillarId: string }) {
      return Promise.resolve(
        state.inaccessible
          ? null
          : (state.values.find((value) => value.id === input.pillarId) ?? null),
      );
    }
  },
}));

import {
  createContentPillarResponse,
  deleteContentPillarResponse,
  getContentPillarResponse,
  listContentPillarsResponse,
  setContentPillarActiveResponse,
  updateContentPillarResponse,
} from '../src/http/content-pillars';

const basePath = '/api/workspaces/workspace-1/bunshins/bunshin-1/content-pillars';
function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: { origin: 'http://localhost:3000', ...init?.headers },
  });
}
function json(method: string, body: unknown) {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

describe('authenticated Content Pillar HTTP contract', () => {
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
    state.values = [pillar];
    state.create.mockResolvedValue(pillar);
    state.update.mockResolvedValue(pillar);
    state.setActive.mockResolvedValue(pillar);
    state.softDelete.mockResolvedValue({ ...pillar, active: false, deletedAt: now });
  });

  it('returns no-store DTOs with ISO dates and no assignment data', async () => {
    const response = await listContentPillarsResponse(
      request(basePath),
      'workspace-1',
      'bunshin-1',
    );
    const body = (await response.json()) as { data: Array<Record<string, unknown>> };
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.data[0]).toMatchObject({
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deletedAt: null,
    });
    expect(JSON.stringify(body)).not.toContain('private');
  });

  it('rejects unauthenticated and inaccessible reads', async () => {
    state.currentUser = null;
    expect(
      (await listContentPillarsResponse(request(basePath), 'workspace-1', 'bunshin-1')).status,
    ).toBe(401);
    state.currentUser = { userId: 'user-1' };
    state.inaccessible = true;
    expect(
      (await listContentPillarsResponse(request(basePath), 'workspace-1', 'bunshin-1')).status,
    ).toBe(404);
  });

  it('creates at 201, validates values, and rejects authority fields', async () => {
    const created = await createContentPillarResponse(
      request(basePath, json('POST', { title: ' 教育 ', description: ' 基礎 ', weight: 80 })),
      'workspace-1',
      'bunshin-1',
    );
    expect(created.status).toBe(201);
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: '教育', description: '基礎', weight: 80 }),
    );
    for (const body of [
      { title: '', weight: 1 },
      { title: 'a'.repeat(101), weight: 1 },
      { title: '教育', description: 'a'.repeat(501), weight: 1 },
      { title: '教育', weight: 0 },
      { title: '教育', weight: 1.5 },
      { title: '教育', weight: 101 },
      { title: '教育', weight: 1, actorUserId: 'attacker' },
      { title: '教育', weight: 1, active: false },
    ]) {
      expect(
        (
          await createContentPillarResponse(
            request(basePath, json('POST', body)),
            'workspace-1',
            'bunshin-1',
          )
        ).status,
      ).toBe(400);
    }
  });

  it('requires a UUID and strict non-empty updates', async () => {
    expect(
      (
        await getContentPillarResponse(
          request(`${basePath}/bad`),
          'workspace-1',
          'bunshin-1',
          'bad',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await updateContentPillarResponse(
          request(`${basePath}/${id}`, json('PATCH', {})),
          'workspace-1',
          'bunshin-1',
          id,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await updateContentPillarResponse(
          request(`${basePath}/${id}`, json('PATCH', { deletedAt: null })),
          'workspace-1',
          'bunshin-1',
          id,
        )
      ).status,
    ).toBe(400);
  });

  it.each([
    ['MISSING', 404],
    ['SUSPENDED', 403],
    ['LOCKED', 403],
  ] as const)('rejects mutation for %s assignment but permits reads', async (status, expected) => {
    state.assignmentStatus = status;
    expect(
      (
        await createContentPillarResponse(
          request(basePath, json('POST', { title: '教育', weight: 80 })),
          'workspace-1',
          'bunshin-1',
        )
      ).status,
    ).toBe(expected);
    expect(
      (await listContentPillarsResponse(request(basePath), 'workspace-1', 'bunshin-1')).status,
    ).toBe(200);
  });

  it('maps duplicates, keeps state changes idempotent, and rejects unsafe requests', async () => {
    state.create.mockRejectedValueOnce(new ApplicationError('CONFLICT', 'duplicate'));
    expect(
      (
        await createContentPillarResponse(
          request(basePath, json('POST', { title: '教育', weight: 80 })),
          'workspace-1',
          'bunshin-1',
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await setContentPillarActiveResponse(
          request(`${basePath}/${id}/deactivate`, json('POST', {})),
          'workspace-1',
          'bunshin-1',
          id,
          false,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await deleteContentPillarResponse(
          request(`${basePath}/${id}`, { method: 'DELETE' }),
          'workspace-1',
          'bunshin-1',
          id,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await deleteContentPillarResponse(
          request(`${basePath}/${id}`, json('DELETE', {})),
          'workspace-1',
          'bunshin-1',
          id,
        )
      ).status,
    ).toBe(400);
    const hostile = new Request(`http://localhost:3000${basePath}`, {
      ...json('POST', { title: '教育', weight: 80 }),
      headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
    });
    expect((await createContentPillarResponse(hostile, 'workspace-1', 'bunshin-1')).status).toBe(
      403,
    );
  });
});
