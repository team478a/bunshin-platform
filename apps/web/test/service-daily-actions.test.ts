import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  actor: null as { userId: string } | null,
  bunshinFound: true,
  memories: [] as Array<Record<string, unknown>>,
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve(state.actor) }),
}));

vi.mock('../src/services/public-service', () => ({
  resolvePublicServiceContext: () =>
    Promise.resolve({
      workspaceId: '22222222-2222-4222-8222-222222222222',
      serviceId: '33333333-3333-4333-8333-333333333333',
      configuration: {},
    }),
}));

vi.mock('../src/daily-actions/daily-action-storage', () => ({
  DAILY_ACTION_PHOTO_MAX_BYTES: 10_000_000,
  DailyActionStorage: class {
    createUploadAuthorization() {
      return Promise.resolve({ method: 'PUT', uploadUrl: 'https://upload.test', headers: {} });
    }
    verifyAndNormalize() {
      return Promise.resolve({ mimeType: 'image/jpeg', sizeBytes: 100, width: 100, height: 100 });
    }
    createReadUrl() {
      return Promise.resolve('https://read.test/photo');
    }
    remove = state.remove;
  },
}));

vi.mock('@bunshin/database', () => ({
  prisma: {
    bunshin: { findFirst: () => Promise.resolve(state.bunshinFound ? { id: 'bunshin' } : null) },
    bunshinMemory: {
      findMany: () => Promise.resolve(state.memories),
      findFirst: (input: { where: { sourceId?: string; id?: string } }) => {
        const wanted = input.where.sourceId ?? input.where.id;
        return Promise.resolve(
          state.memories.find((item) => item['sourceId'] === wanted || item['id'] === wanted) ??
            null,
        );
      },
      create: state.create,
      update: state.update,
      updateMany: state.updateMany,
    },
  },
}));

import {
  createServiceDailyActionResponse,
  deleteServiceDailyActionResponse,
  listServiceDailyActionsResponse,
} from '../src/http/service-daily-actions';

const serviceSlug = 'test-service';
const bunshinId = '44444444-4444-4444-8444-444444444444';
const actionId = '55555555-5555-4555-8555-555555555555';
const key = '66666666-6666-4666-8666-666666666666';

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: { origin: 'http://localhost:3000', ...init?.headers },
  });
}

function memory(overrides: Record<string, unknown> = {}) {
  return {
    id: actionId,
    workspaceId: '22222222-2222-4222-8222-222222222222',
    bunshinId,
    type: 'FAQ',
    content: '予約なしでも入れますか？',
    summary: 'お客様から聞かれた質問',
    sourceType: 'USER_INPUT',
    sourceId: `daily-action:CUSTOMER_QUESTION:${key}`,
    attachmentStatus: null,
    attachmentStorageKey: null,
    createdAt: new Date('2026-09-12T00:00:00.000Z'),
    ...overrides,
  };
}

describe('service Daily Action HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('LOG_LEVEL', 'info');
    state.actor = { userId: '11111111-1111-4111-8111-111111111111' };
    state.bunshinFound = true;
    state.memories = [];
    state.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(memory(data)),
    );
  });

  it('creates an owner-scoped question as a Bunshin memory', async () => {
    const response = await createServiceDailyActionResponse(
      request('/daily-actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'CUSTOMER_QUESTION',
          text: '予約なしでも入れますか？',
          idempotencyKey: key,
        }),
      }),
      serviceSlug,
      bunshinId,
    );
    expect(response.status).toBe(201);
    expect(state.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: '22222222-2222-4222-8222-222222222222',
        bunshinId,
        type: 'FAQ',
        sourceId: `daily-action:CUSTOMER_QUESTION:${key}`,
      }),
    });
    const body = (await response.json()) as { data: { action: { type: string } } };
    expect(body.data.action.type).toBe('CUSTOMER_QUESTION');
  });

  it('does not reveal records when the requested Bunshin is not owned in the service', async () => {
    state.bunshinFound = false;
    state.memories = [memory()];
    const response = await listServiceDailyActionsResponse(
      request('/daily-actions'),
      serviceSlug,
      bunshinId,
    );
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('予約なし');
  });

  it('requires same-origin before creating or deleting material', async () => {
    const create = await createServiceDailyActionResponse(
      new Request('http://localhost:3000/daily-actions', {
        method: 'POST',
        headers: { origin: 'https://attacker.test', 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'REST_REASON',
          text: '今日は忙しい',
          idempotencyKey: key,
        }),
      }),
      serviceSlug,
      bunshinId,
    );
    const remove = await deleteServiceDailyActionResponse(
      new Request(`http://localhost:3000/daily-actions/${actionId}`, {
        method: 'DELETE',
        headers: { origin: 'https://attacker.test' },
      }),
      serviceSlug,
      bunshinId,
      actionId,
    );
    expect(create.status).toBe(403);
    expect(remove.status).toBe(403);
    expect(state.create).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });
});
