import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  admin: vi.fn(),
  member: vi.fn(),
  bunshins: vi.fn(),
  find: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  access: vi.fn(),
  generate: vi.fn(),
  render: vi.fn(),
  store: vi.fn(),
  signed: vi.fn(),
  remove: vi.fn(),
  usage: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.com' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => ({ getCurrentUser: m.actor }),
}));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  resolveOpenAiRuntimeConfiguration: () => ({ apiKey: 'test', requestCostUsdMicros: 100 }),
}));
vi.mock('../src/providers/openai-social-image-generation', () => ({
  OpenAiSocialImageGenerationAdapter: class {
    generate = m.generate;
  },
  OpenAiSocialImageProviderError: class extends Error {},
}));
vi.mock('../src/social-image-renderer', () => ({
  ManagedSocialImageRenderer: class {
    render = m.render;
  },
  loadBundledSocialImageFonts: vi.fn(),
}));
vi.mock('../src/social-image-storage', () => ({
  SupabaseSocialImageStorage: class {
    store = m.store;
    createReadUrl = m.signed;
    remove = m.remove;
  },
}));
vi.mock('../src/observability/ai-usage', () => ({ recordAiUsageSafely: m.usage }));
vi.mock('@bunshin/application', async (original) => ({
  ...(await original<object>()),
  GroupFeatureEntitlementService: class {
    consumeAccess = m.access;
  },
}));
vi.mock('@bunshin/database', () => {
  const db = {
    platformAdmin: { findFirst: m.admin },
    groupMembership: { findFirst: m.member },
    bunshin: { findMany: m.bunshins },
    socialImageSample: {
      findUnique: m.find,
      count: m.count,
      create: m.create,
      update: m.update,
      updateMany: m.updateMany,
    },
  };
  return {
    prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) },
    PrismaGroupFeatureEntitlementRepository: class {},
  };
});
import {
  createImageSample,
  imageSampleScope,
  readImageSample,
  deleteImageSample,
} from '../src/http/social-image-samples';
const id = '11111111-1111-4111-8111-111111111111';
const groupId = '22222222-2222-4222-8222-222222222222';
const bunshinId = '33333333-3333-4333-8333-333333333333';
const input = {
  id,
  groupId,
  bunshinId,
  headline: '知識を、つながりに。',
  bodyLines: ['千ノ国メディア'],
  cta: '一緒に学ぼう',
  artDirection: '落ち着いた紺色の背景に本と光を描く',
};
const request = (data: unknown = input, origin = 'https://example.com') =>
  new Request('https://example.com/api/admin/image-samples', {
    method: 'POST',
    headers: { origin },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: 'owner' });
  m.admin.mockResolvedValue({ id: 'admin' });
  m.member.mockResolvedValue({ workspaceId: 'workspace', group: { name: 'service' } });
  m.bunshins.mockResolvedValue([{ id: bunshinId, name: 'partner' }]);
  m.find.mockResolvedValue(null);
  m.count.mockResolvedValue(0);
  m.create.mockImplementation(({ data }) => Promise.resolve(data));
  m.access.mockResolvedValue({ allowed: true });
  m.generate.mockResolvedValue({
    bytes: new Uint8Array([1]),
    inputTokens: 1,
    outputTokens: 2,
    latencyMs: 3,
  });
  m.render.mockResolvedValue({
    completedPng: new Uint8Array([2]),
    thumbnailPng: new Uint8Array([3]),
  });
  m.signed.mockResolvedValue({ url: 'https://storage.example/signed' });
});
describe('administrator image quality samples', () => {
  it('does not allow anonymous or ordinary members to use the trial', async () => {
    m.actor.mockResolvedValue(null);
    expect(await imageSampleScope(groupId)).toBeNull();
    m.actor.mockResolvedValue({ userId: 'owner' });
    m.admin.mockResolvedValue(null);
    expect((await createImageSample(request())).status).toBe(403);
    expect(m.generate).not.toHaveBeenCalled();
  });
  it('requires the admin to have a consented membership and their own bunshin', async () => {
    m.member.mockResolvedValue(null);
    expect(await imageSampleScope(groupId, bunshinId)).toBeNull();
    m.member.mockResolvedValue({ workspaceId: 'workspace' });
    m.bunshins.mockResolvedValue([]);
    expect(await imageSampleScope(groupId, bunshinId)).toBeNull();
    expect(m.bunshins).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerUserId: 'owner',
          workspaceId: 'workspace',
          id: bunshinId,
        }),
      }),
    );
  });
  it('rejects cross-site requests and overlong Japanese copy without calling the provider', async () => {
    expect((await createImageSample(request(input, 'https://evil.example'))).status).toBe(403);
    expect((await createImageSample(request({ ...input, headline: '長'.repeat(21) }))).status).toBe(
      400,
    );
    expect(m.generate).not.toHaveBeenCalled();
  });
  it('creates one privately stored 1080x1350 composed image and records usage', async () => {
    expect((await createImageSample(request())).status).toBe(200);
    expect(m.generate).toHaveBeenCalledWith(
      expect.objectContaining({ quality: 'medium', width: 1080, height: 1350 }),
    );
    expect(m.store).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 'owner',
        groupId,
        requestId: id,
        mediaId: id,
        source: null,
      }),
    );
    expect(m.update).toHaveBeenCalledWith({ where: { id }, data: { status: 'READY' } });
    expect(m.usage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SUCCESS', promptVersion: 'social-image-admin-sample-v1' }),
    );
  });
  it('replays the same request without a second provider call and rejects changed inputs', async () => {
    await createImageSample(request());
    const data = m.create.mock.calls[0]![0].data;
    m.find.mockResolvedValue({ ...data, status: 'READY' });
    expect((await createImageSample(request())).status).toBe(200);
    expect(m.generate).toHaveBeenCalledTimes(1);
    expect((await createImageSample(request({ ...input, headline: '別の見出し' }))).status).toBe(
      409,
    );
    expect(m.generate).toHaveBeenCalledTimes(1);
  });
  it.each([3, 10])('stops at the trial budget (%i)', async (used) => {
    m.count.mockResolvedValue(used);
    expect((await createImageSample(request())).status).toBe(403);
    expect(m.generate).not.toHaveBeenCalled();
  });
  it('honors disabled group access before any paid generation', async () => {
    m.access.mockResolvedValue({ allowed: false });
    expect((await createImageSample(request())).status).toBe(403);
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });
  it('does not expose another owner sample even to an administrator', async () => {
    m.find.mockResolvedValue({ id, groupId, bunshinId, ownerUserId: 'other', status: 'READY' });
    expect((await readImageSample(id, true)).status).toBe(404);
    expect(m.signed).not.toHaveBeenCalled();
    expect((await deleteImageSample(request(), id)).status).toBe(404);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it('signs only a ready, owned image and never publishes a partially generated image', async () => {
    m.find.mockResolvedValue({
      id,
      groupId,
      bunshinId,
      ownerUserId: 'owner',
      workspaceId: 'workspace',
      status: 'GENERATING',
      createdAt: new Date(),
    });
    expect((await readImageSample(id, true)).status).toBe(404);
    m.find.mockResolvedValue({
      id,
      groupId,
      bunshinId,
      ownerUserId: 'owner',
      workspaceId: 'workspace',
      status: 'READY',
    });
    expect((await readImageSample(id, true)).headers.get('location')).toBe(
      'https://storage.example/signed',
    );
  });
  it('deletes stored media while retaining the attempt count', async () => {
    m.find.mockResolvedValue({
      id,
      groupId,
      bunshinId,
      ownerUserId: 'owner',
      workspaceId: 'workspace',
      status: 'READY',
    });
    expect((await deleteImageSample(request(), id)).status).toBe(204);
    expect(m.remove).toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DELETED' }) }),
    );
  });
});
