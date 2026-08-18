import type { BunshinMemory } from '@bunshin/platform-domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  currentUser: null as { userId: string } | null,
  memories: [] as BunshinMemory[],
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
  PrismaBunshinMemoryRepository: class {
    create = state.create;
    update = state.update;
    setActive = state.setActive;
    softDelete = state.softDelete;
    list() {
      return Promise.resolve(state.memories);
    }
    find(input: { memoryId: string }) {
      return Promise.resolve(state.memories.find((memory) => memory.id === input.memoryId) ?? null);
    }
  },
}));

import {
  createMemoryResponse,
  deleteMemoryResponse,
  listMemoriesResponse,
} from '../src/http/memories';

const now = new Date('2026-08-19T00:00:00.000Z');
const memory = (active: boolean): BunshinMemory => ({
  id: active ? 'active-memory' : 'inactive-memory',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  type: 'EXPERIENCE',
  content: active ? '公開する内容' : '無効な内容',
  summary: null,
  sourceType: 'USER_INPUT',
  sourceId: null,
  confidence: 0.8,
  importance: 3,
  active,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
});

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: { origin: 'http://localhost:3000', ...init?.headers },
  });
}

describe('authenticated Memory HTTP contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('LOG_LEVEL', 'info');
    state.currentUser = { userId: 'user-1' };
    state.memories = [memory(true), memory(false)];
  });

  it('returns active and inactive lists separately without deletedAt or sourceId', async () => {
    const active = await listMemoriesResponse(
      request('/api/workspaces/workspace-1/bunshins/bunshin-1/memories'),
      'workspace-1',
      'bunshin-1',
    );
    const inactive = await listMemoriesResponse(
      request('/api/workspaces/workspace-1/bunshins/bunshin-1/memories?status=inactive'),
      'workspace-1',
      'bunshin-1',
    );
    const activeBody = (await active.json()) as { data: Array<Record<string, unknown>> };
    const inactiveBody = (await inactive.json()) as { data: Array<Record<string, unknown>> };
    expect(activeBody.data.map(({ id }) => id)).toEqual(['active-memory']);
    expect(inactiveBody.data.map(({ id }) => id)).toEqual(['inactive-memory']);
    expect(activeBody.data[0]).not.toHaveProperty('deletedAt');
    expect(activeBody.data[0]).not.toHaveProperty('sourceId');
    expect(active.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects unauthenticated access', async () => {
    state.currentUser = null;
    const response = await listMemoriesResponse(
      request('/api/workspaces/workspace-1/bunshins/bunshin-1/memories'),
      'workspace-1',
      'bunshin-1',
    );
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('公開する内容');
  });

  it('rejects supplied source and state fields before persistence', async () => {
    const response = await createMemoryResponse(
      request('/api/workspaces/workspace-1/bunshins/bunshin-1/memories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'EXPERIENCE',
          content: '本文',
          confidence: 1,
          importance: 3,
          sourceType: 'SYSTEM',
          active: false,
        }),
      }),
      'workspace-1',
      'bunshin-1',
    );
    expect(response.status).toBe(400);
    expect(state.create).not.toHaveBeenCalled();
  });

  it('requires same-origin and rejects a DELETE body', async () => {
    const crossOrigin = await deleteMemoryResponse(
      new Request(
        'http://localhost:3000/api/workspaces/workspace-1/bunshins/bunshin-1/memories/active-memory',
        { method: 'DELETE', headers: { origin: 'https://attacker.example' } },
      ),
      'workspace-1',
      'bunshin-1',
      'active-memory',
    );
    const withBody = await deleteMemoryResponse(
      request('/api/workspaces/workspace-1/bunshins/bunshin-1/memories/active-memory', {
        method: 'DELETE',
        body: '{}',
      }),
      'workspace-1',
      'bunshin-1',
      'active-memory',
    );
    expect(crossOrigin.status).toBe(403);
    expect(withBody.status).toBe(400);
    expect(state.softDelete).not.toHaveBeenCalled();
  });
});
