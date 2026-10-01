import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

const state = vi.hoisted(() => ({
  actor: null as { userId: string } | null,
  bunshinFound: true,
  memories: [] as Array<Record<string, unknown>>,
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  remove: vi.fn(),
  member: vi.fn(),
  bunshin: vi.fn(),
  executePhotoFirst: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve(state.actor) }),
}));

vi.mock('../src/services/public-service', () => ({
  resolveMemberServiceContext: state.member,
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

vi.mock('../src/services/mission-content-variant-generation', () => ({
  createMissionContentVariantGenerationService: () => ({
    executePhotoFirst: state.executePhotoFirst,
  }),
}));

vi.mock('@bunshin/database', () => ({
  prisma: {
    bunshin: { findFirst: state.bunshin },
    bunshinMemory: {
      findMany: () => Promise.resolve(state.memories),
      findFirst: (input: { where: { sourceId?: string; id?: string } }) => {
        const wanted = input.where.id ?? input.where.sourceId;
        return Promise.resolve(
          state.memories.find((item) => item['sourceId'] === wanted || item['id'] === wanted) ??
            null,
        );
      },
      create: state.create,
      update: state.update,
      updateMany: state.updateMany,
    },
    $transaction: (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        bunshinMemory: { update: state.update, updateMany: state.updateMany },
      }),
  },
}));

import {
  createServiceDailyActionResponse,
  deleteServiceDailyActionResponse,
  generateServicePhotoFirstResponse,
  listServiceDailyActionsResponse,
  updateServiceDailyActionPhotoPreferenceResponse,
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
    automaticImageReference: false,
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
    state.member.mockResolvedValue({
      workspaceId: '22222222-2222-4222-8222-222222222222',
      serviceId: '33333333-3333-4333-8333-333333333333',
      configuration: {},
    });
    state.bunshin.mockImplementation(() =>
      Promise.resolve(state.bunshinFound ? { id: 'bunshin' } : null),
    );
    state.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(memory(data)),
    );
    state.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(memory(data)),
    );
    state.executePhotoFirst.mockResolvedValue({
      variant: {
        id: '77777777-7777-4777-8777-777777777777',
        dailyMissionId: '88888888-8888-4888-8888-888888888888',
        sequence: 1,
        format: 'TEXT',
        content: { body: '写真から考えた投稿です', cta: '保存してご覧ください' },
        qualityScore: 91,
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        selectedAt: null,
        photoFirst: {
          photoMemoryId: actionId,
          analysis: {
            imageType: 'product',
            subjects: ['商品'],
            objects: [],
            scene: '店内',
            visibleText: [],
            possibleContentAngles: ['使い方'],
            qualityNotes: [],
            uncertainElements: [],
            safetyFlags: [],
          },
          planning: {
            theme: '商品の使い方',
            angle: '初めての方向け',
            recommendationReason: '今日の認知目的に合うため',
            photoUsage: '主役として使う',
            imageEditPrompt: '明るさだけを自然に整える',
            confirmationQuestion: null,
          },
          analyzerModel: 'test-model',
          analyzerPromptVersion: 'photo-first-analysis-v1',
        },
      },
      photoFirst: {
        photoMemoryId: actionId,
        analysis: {
          imageType: 'product',
          subjects: ['商品'],
          objects: [],
          scene: '店内',
          visibleText: [],
          possibleContentAngles: ['使い方'],
          qualityNotes: [],
          uncertainElements: [],
          safetyFlags: [],
        },
        planning: {
          theme: '商品の使い方',
          angle: '初めての方向け',
          recommendationReason: '今日の認知目的に合うため',
          photoUsage: '主役として使う',
          imageEditPrompt: '明るさだけを自然に整える',
          confirmationQuestion: null,
        },
        analyzerModel: 'test-model',
        analyzerPromptVersion: 'photo-first-analysis-v1',
      },
    });
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
    expect(state.member).toHaveBeenCalledWith(serviceSlug, state.actor?.userId);
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

  it('does not resolve a private service for anonymous readers', async () => {
    state.actor = null;
    expect(
      (await listServiceDailyActionsResponse(request('/daily-actions'), serviceSlug, bunshinId))
        .status,
    ).toBe(401);
    expect(state.member).not.toHaveBeenCalled();
    expect(state.bunshin).not.toHaveBeenCalled();
  });

  it('rejects unavailable or nonmember services before record access', async () => {
    state.member.mockRejectedValue(new ApplicationError('NOT_FOUND', 'service not found'));
    expect(
      (await listServiceDailyActionsResponse(request('/daily-actions'), serviceSlug, bunshinId))
        .status,
    ).toBe(404);
    expect(state.bunshin).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
  });

  it('does not reuse another service scope for daily records', async () => {
    state.member.mockResolvedValue({
      workspaceId: 'workspace-b',
      serviceId: 'service-b',
      configuration: {},
    });
    expect(
      (await listServiceDailyActionsResponse(request('/daily-actions'), 'private-b', bunshinId))
        .status,
    ).toBe(200);
    expect(state.bunshin).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-b',
          groupId: 'service-b',
          ownerUserId: state.actor?.userId,
          id: bunshinId,
          group: expect.objectContaining({
            memberships: {
              some: { userId: state.actor?.userId, status: 'ACTIVE', consentedAt: { not: null } },
            },
          }),
        }),
      }),
    );
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

  it('selects one ready owned photo for future automatic images', async () => {
    state.memories = [
      memory({
        type: 'EXPERIENCE',
        sourceId: `daily-action:PHOTO:${key}`,
        attachmentStatus: 'READY',
        attachmentStorageKey: 'workspace/owner/photo.jpg',
      }),
    ];

    const response = await updateServiceDailyActionPhotoPreferenceResponse(
      request(`/daily-actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ useForAutomaticImages: true }),
      }),
      serviceSlug,
      bunshinId,
      actionId,
    );

    expect(response.status).toBe(200);
    expect(state.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workspaceId: '22222222-2222-4222-8222-222222222222',
        bunshinId,
        automaticImageReference: true,
      }),
      data: { automaticImageReference: false },
    });
    expect(state.update).toHaveBeenCalledWith({
      where: { id: actionId },
      data: { automaticImageReference: true },
    });
    const body = (await response.json()) as {
      data: { useForAutomaticImages: boolean };
    };
    expect(body.data.useForAutomaticImages).toBe(true);
  });

  it('starts Photo First generation with the authenticated service scope', async () => {
    const dailyMissionId = '88888888-8888-4888-8888-888888888888';
    const response = await generateServicePhotoFirstResponse(
      request(`/daily-actions/${actionId}/photo-first`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': key },
        body: JSON.stringify({ dailyMissionId, idempotencyKey: key }),
      }),
      serviceSlug,
      bunshinId,
      actionId,
    );

    expect(response.status).toBe(201);
    expect(state.member).toHaveBeenCalledWith(serviceSlug, state.actor?.userId);
    expect(state.executePhotoFirst).toHaveBeenCalledWith({
      workspaceId: '22222222-2222-4222-8222-222222222222',
      groupId: '33333333-3333-4333-8333-333333333333',
      bunshinId,
      actorUserId: state.actor?.userId,
      dailyMissionId,
      photoActionId: actionId,
      generationIdempotencyKey: key,
      usageIdempotencyPrefix: key,
      serviceSafeMode: true,
      allowServiceOwnerMemories: true,
    });
    const body = (await response.json()) as {
      data: { photoFirst: { photoMemoryId: string; planning: { theme: string } } };
    };
    expect(body.data.photoFirst.photoMemoryId).toBe(actionId);
    expect(body.data.photoFirst.planning.theme).toBe('商品の使い方');
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
    const updatePhoto = await updateServiceDailyActionPhotoPreferenceResponse(
      new Request(`http://localhost:3000/daily-actions/${actionId}`, {
        method: 'PATCH',
        headers: { origin: 'https://attacker.test', 'content-type': 'application/json' },
        body: JSON.stringify({ useForAutomaticImages: true }),
      }),
      serviceSlug,
      bunshinId,
      actionId,
    );
    const photoFirst = await generateServicePhotoFirstResponse(
      new Request(`http://localhost:3000/daily-actions/${actionId}/photo-first`, {
        method: 'POST',
        headers: { origin: 'https://attacker.test', 'content-type': 'application/json' },
        body: JSON.stringify({
          dailyMissionId: '88888888-8888-4888-8888-888888888888',
          idempotencyKey: key,
        }),
      }),
      serviceSlug,
      bunshinId,
      actionId,
    );
    expect(create.status).toBe(403);
    expect(remove.status).toBe(403);
    expect(updatePhoto.status).toBe(403);
    expect(photoFirst.status).toBe(403);
    expect(state.create).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
    expect(state.executePhotoFirst).not.toHaveBeenCalled();
  });
});
