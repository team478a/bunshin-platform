import type { BunshinPersonalityVersion } from '@bunshin/application';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const now = new Date('2026-08-25T00:00:00.000Z');
const version: BunshinPersonalityVersion = {
  id: 'version-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  version: 1,
  source: 'INITIAL',
  changeReason: '最初の設定',
  basedOnVersionId: null,
  tone: 'やさしい',
  formality: 'ふつう',
  energyLevel: '落ち着いている',
  expertiseLevel: '初心者向け',
  sentenceStyle: '短い文',
  firstPerson: 'わたし',
  forbiddenExpressions: [],
  preferredExpressions: ['いっしょに'],
  visualDirection: null,
  facePolicy: 'FULL_ANONYMOUS',
  createdByUserId: 'user-1',
  createdAt: now,
};

const state = vi.hoisted(() => ({
  currentUser: null as { userId: string } | null,
  versions: [] as BunshinPersonalityVersion[],
  create: vi.fn(),
  restore: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve(state.currentUser) }),
}));

vi.mock('../src/auth/request-security', async () => {
  const { ApplicationError } = await import('@bunshin/shared');
  return {
    requireSameOrigin(request: Request) {
      if (request.headers.get('origin') !== 'http://localhost:3000')
        throw new ApplicationError('FORBIDDEN', 'Request origin is invalid');
    },
  };
});

vi.mock('@bunshin/database', () => ({
  PrismaPersonalityVersionRepository: class {
    create = state.create;
    restore = state.restore;
    list() {
      return Promise.resolve(state.versions);
    }
  },
}));

import {
  createPersonalityVersionResponse,
  listPersonalityVersionsResponse,
  restorePersonalityVersionResponse,
} from '../src/http/personality-versions';

const request = (path: string, init?: RequestInit) =>
  new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: { origin: 'http://localhost:3000', ...init?.headers },
  });

describe('Personality Version HTTP contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    state.currentUser = { userId: 'user-1' };
    state.versions = [version];
    state.create.mockResolvedValue({ ...version, version: 2, source: 'MANUAL' });
    state.restore.mockResolvedValue({ ...version, version: 2, source: 'RESTORE' });
  });

  it('lists versions without exposing the actor user id', async () => {
    const response = await listPersonalityVersionsResponse(
      request('/api/workspaces/workspace-1/bunshins/bunshin-1/personality-versions'),
      'workspace-1',
      'bunshin-1',
    );
    const body = (await response.json()) as { data: Array<Record<string, unknown>> };
    expect(response.status).toBe(200);
    expect(body.data[0]).not.toHaveProperty('createdByUserId');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('accepts a valid manual version and fixes the source server-side', async () => {
    const response = await createPersonalityVersionResponse(
      request('/api/workspaces/workspace-1/bunshins/bunshin-1/personality-versions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          changeReason: '話し方を変更',
          tone: version.tone,
          formality: version.formality,
          energyLevel: version.energyLevel,
          expertiseLevel: version.expertiseLevel,
          sentenceStyle: version.sentenceStyle,
          firstPerson: version.firstPerson,
          forbiddenExpressions: [],
          preferredExpressions: [],
          visualDirection: null,
          facePolicy: version.facePolicy,
        }),
      }),
      'workspace-1',
      'bunshin-1',
    );
    expect(response.status).toBe(201);
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ source: 'MANUAL' }));
  });

  it('rejects caller-supplied source and cross-origin restore', async () => {
    const invalid = await createPersonalityVersionResponse(
      request('/api/workspaces/workspace-1/bunshins/bunshin-1/personality-versions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'LEARNING' }),
      }),
      'workspace-1',
      'bunshin-1',
    );
    const crossOrigin = await restorePersonalityVersionResponse(
      new Request('http://localhost:3000/restore', {
        method: 'POST',
        headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
        body: JSON.stringify({ changeReason: '戻す' }),
      }),
      'workspace-1',
      'bunshin-1',
      'version-1',
    );
    expect(invalid.status).toBe(400);
    expect(crossOrigin.status).toBe(403);
    expect(state.restore).not.toHaveBeenCalled();
  });
});
