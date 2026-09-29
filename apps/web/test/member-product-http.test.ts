import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  member: vi.fn(),
  public: vi.fn(),
  save: vi.fn(),
  archive: vi.fn(),
  event: vi.fn(),
  find: vi.fn(),
  profile: vi.fn(),
  settings: vi.fn(),
  repository: vi.fn(),
  runtime: vi.fn(),
  generate: vi.fn(),
  quota: vi.fn(),
  usage: vi.fn(),
  generation: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.com' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({
  resolveMemberServiceContext: m.member,
  resolvePublicServiceContext: m.public,
}));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  resolveOpenAiRuntimeConfiguration: m.runtime,
}));
vi.mock('../src/observability/ai-usage', () => ({ recordAiUsageSafely: m.usage }));
vi.mock('../src/organization-ai-generation-quota', () => ({
  withOrganizationAiGenerationQuota: m.quota,
}));
vi.mock('../src/providers/openai-member-product-suggestion-generator', () => ({
  MEMBER_PRODUCT_SUGGESTION_PROMPT_VERSION: 'member-product-suggestions-v2',
  OpenAIMemberProductSuggestionGenerator: class {
    generate = m.generate;
  },
}));
vi.mock('@bunshin/database', () => ({
  PrismaMemberProductProfileRepository: class {
    save = m.save;
    archive = m.archive;
    getGenerationContext = m.profile;
  },
  PrismaMemberProductActivityRepository: class {
    recordEvent = m.event;
    recordGeneration = m.generation;
  },
  PrismaBunshinRepository: class {
    find = m.find;
  },
  PrismaExternalTrackingLinkRepository: class {
    constructor(client: unknown, groupId: string) {
      m.repository(client, groupId);
    }
    listMemberSettings = m.settings;
  },
}));
import {
  saveMemberProductProfileResponse,
  archiveMemberProductProfileResponse,
} from '../src/http/member-product-profiles';
import { recordMemberProductActivityResponse } from '../src/http/member-product-activity';
import { generateMemberProductSuggestionsResponse } from '../src/http/member-product-suggestions';

const id = '00000000-0000-4000-8000-000000000001';
const linkId = '00000000-0000-4000-8000-000000000002';
const bunshinId = '00000000-0000-4000-8000-000000000003';
const requestId = '00000000-0000-4000-8000-000000000004';
const product = { externalTrackingLinkId: linkId, name: '本人の商品', appealPoint: '使いやすい' };
const official = {
  name: '公式商品',
  summary: '公式概要',
  providerName: '公式社',
  targetCustomer: '初心者',
  facts: {},
  suitableFor: [],
  unsuitableFor: [],
  requiredDisclosures: ['提供：公式社'],
  forbiddenExpressions: ['必ず効く'],
  conditionalExpressions: [],
};
const profile = {
  id,
  ...product,
  targetAudience: '初心者',
  productPackId: null,
  officialProduct: null,
};
const bunshin = {
  id: bunshinId,
  name: '自分の投稿パートナー',
  objectiveSummary: '紹介',
  audienceSummary: '初心者',
  personalitySummary: '親しみやすい',
  personality: {
    tone: 'やさしい',
    firstPerson: '私',
    preferredExpressions: ['一緒に'],
    forbiddenExpressions: ['絶対'],
  },
};
function context(groupId = 'service-a', workspaceId = 'workspace-a') {
  return { serviceId: groupId, workspaceId };
}
function request(body: unknown, origin = 'https://example.com') {
  return new Request('https://example.com/api/services/private-a/member-products', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'x-request-id': requestId },
    body: JSON.stringify(body),
  });
}
const operations = [
  {
    name: 'create',
    body: product,
    run: saveMemberProductProfileResponse,
    repo: m.save,
    status: 201,
  },
  {
    name: 'edit',
    body: { ...product, profileId: id },
    run: saveMemberProductProfileResponse,
    repo: m.save,
    status: 200,
  },
  {
    name: 'archive',
    body: {},
    run: (r: Request, slug: string) => archiveMemberProductProfileResponse(r, slug, id),
    repo: m.archive,
    status: 200,
  },
  ...(['COPIED', 'POSTED'] as const).map((type) => ({
    name: type,
    body: { activityId: id, type, candidateIndex: 1 },
    run: recordMemberProductActivityResponse,
    repo: m.event,
    status: 200,
  })),
  {
    name: 'suggestions',
    body: { profileId: id, bunshinId, platform: 'X' },
    run: generateMemberProductSuggestionsResponse,
    repo: m.profile,
    status: 200,
  },
];
function noEffects() {
  for (const fn of [m.save, m.archive, m.event, m.quota, m.generate, m.generation, m.usage])
    expect(fn).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: 'user-a' });
  m.member.mockResolvedValue(context());
  m.save.mockResolvedValue({ id, ...product });
  m.archive.mockResolvedValue(true);
  m.event.mockResolvedValue({ recorded: true });
  m.find.mockResolvedValue(bunshin);
  m.profile.mockResolvedValue(profile);
  m.settings.mockResolvedValue({
    systems: [],
    links: [{ id: linkId, status: 'ACTIVE', url: 'https://agency.example/member-a' }],
  });
  m.runtime.mockResolvedValue({
    apiKey: 'mock-only',
    model: 'configured-model',
    requestCostUsdMicros: 123,
  });
  m.quota.mockImplementation((input: { generate: () => Promise<unknown> }) => input.generate());
  m.generate.mockResolvedValue({
    candidates: ['案A', '案B', '案C'],
    model: 'configured-model',
    promptVersion: 'member-product-suggestions-v2',
    inputTokens: 100,
    outputTokens: 60,
    latencyMs: 20,
  });
  m.generation.mockResolvedValue({ id: 'activity-a', createdAt: new Date() });
});

describe.each(operations)('$name member product scope', ({ body, run, repo, status }) => {
  it('accepts a private member, resolves auth first and avoids public lookup', async () => {
    const response = await run(request(body), 'private-a');
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(m.member).toHaveBeenCalledExactlyOnceWith('private-a', 'user-a');
    expect(m.actor.mock.invocationCallOrder[0]).toBeLessThan(m.member.mock.invocationCallOrder[0]!);
    expect(m.public).not.toHaveBeenCalled();
    expect(repo).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        actorUserId: 'user-a',
      }),
    );
  });
  it('rejects an anonymous actor before resolving or touching repositories', async () => {
    m.actor.mockResolvedValue(null);
    expect((await run(request(body), 'private-a')).status).toBe(401);
    expect(m.member).not.toHaveBeenCalled();
    expect(repo).not.toHaveBeenCalled();
    noEffects();
  });
  it.each(['not-a-member', 'unavailable'])(
    'rejects service %s before repository work',
    async (slug) => {
      m.member.mockRejectedValue(new ApplicationError('NOT_FOUND', 'service unavailable'));
      expect((await run(request(body), slug)).status).toBe(404);
      expect(repo).not.toHaveBeenCalled();
      noEffects();
    },
  );
  it('keeps unknown resolver failures as server errors', async () => {
    m.member.mockRejectedValue(new Error('resolver unavailable'));
    expect((await run(request(body), 'private-a')).status).toBe(500);
    noEffects();
  });
  it('rejects a foreign origin before auth', async () => {
    expect((await run(request(body, 'https://foreign.example'), 'private-a')).status).toBe(403);
    expect(m.actor).not.toHaveBeenCalled();
    noEffects();
  });
  it('uses only switched service and actor data', async () => {
    m.actor.mockResolvedValue({ userId: 'user-b' });
    m.member.mockResolvedValue(context('service-b', 'workspace-b'));
    expect((await run(request(body), 'private-b')).status).toBe(status);
    expect(repo).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-b',
        groupId: 'service-b',
        actorUserId: 'user-b',
      }),
    );
  });
  it('returns no result when the scoped repository refuses ownership', async () => {
    repo.mockResolvedValue(null);
    const response = await run(request(body), 'private-a');
    expect(response.status).toBe(404);
    expect((await response.json()).data).toBeUndefined();
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.generation).not.toHaveBeenCalled();
  });
});

describe('product validation and activities', () => {
  it.each(operations.filter((operation) => operation.name !== 'archive'))(
    'rejects scope ID injection for $name',
    async ({ body, run }) => {
      for (const key of ['workspaceId', 'groupId', 'actorUserId', 'groupMembershipId']) {
        const response = await run(request({ ...body, [key]: 'foreign' }), 'private-a');
        expect(response.status).toBe(400);
        noEffects();
      }
    },
  );
  it('rejects an invalid archive ID before archive mutation', async () => {
    expect(
      (await archiveMemberProductProfileResponse(request({}), 'private-a', 'not-a-uuid')).status,
    ).toBe(400);
    expect(m.archive).not.toHaveBeenCalled();
  });
  it('retains the existing no-op archive result', async () => {
    m.archive.mockResolvedValue(false);
    const response = await archiveMemberProductProfileResponse(request({}), 'private-a', id);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ archived: false });
  });
  it.each([-1, 10, 0.5])('refuses invalid activity candidate %s', async (candidateIndex) => {
    expect(
      (
        await recordMemberProductActivityResponse(
          request({ activityId: id, type: 'POSTED', candidateIndex }),
          'private-a',
        )
      ).status,
    ).toBe(400);
    expect(m.event).not.toHaveBeenCalled();
  });
  it('keeps event identity and idempotent no-op without accepting a URL', async () => {
    m.event.mockResolvedValue({ recorded: false });
    const response = await recordMemberProductActivityResponse(
      request({ activityId: id, type: 'COPIED', candidateIndex: 1 }),
      'private-a',
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.recorded).toBe(false);
    expect(m.event).toHaveBeenCalledWith(
      expect.objectContaining({
        contentRunId: id,
        type: 'COPIED',
        candidateIndex: 1,
        operationKey: `${requestId}:member-product-activity`,
      }),
    );
    expect(m.event.mock.calls[0]![0]).not.toHaveProperty('url');
  });
});

describe('member product suggestion policies', () => {
  const input = { profileId: id, bunshinId, platform: 'X' };
  it('does not publish candidates when the post-generation repository rejects ownership', async () => {
    m.generation.mockResolvedValue(null);
    const response = await generateMemberProductSuggestionsResponse(request(input), 'private-a');
    expect(response.status).toBe(404);
    expect((await response.json()).data).toBeUndefined();
    expect(m.usage).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCESS' }));
  });
  it.each([
    ['X', 280],
    ['THREADS', 500],
    ['INSTAGRAM', 2200],
  ] as const)('retains the %s character limit and a single PR label', async (platform, limit) => {
    m.generate.mockResolvedValue({
      candidates: ['投稿'.repeat(1800)],
      model: 'configured-model',
      promptVersion: 'member-product-suggestions-v2',
    });
    const response = await generateMemberProductSuggestionsResponse(
      request({ ...input, platform }),
      'private-a',
    );
    expect(response.status).toBe(200);
    const data = (await response.json()).data;
    expect(data.candidates[0].characterCount).toBeLessThanOrEqual(limit);
    expect(data.candidates[0].body.split('#PR')).toHaveLength(2);
  });
  it('uses reloaded product/personality and scoped URL, quota, usage and activity', async () => {
    m.member.mockResolvedValue(context('service-b', 'workspace-b'));
    m.profile.mockResolvedValue({ ...profile, productPackId: id, officialProduct: official });
    const response = await generateMemberProductSuggestionsResponse(request(input), 'private-b');
    expect(response.status).toBe(200);
    expect(m.find).toHaveBeenCalledWith({
      workspaceId: 'workspace-b',
      groupId: 'service-b',
      actorUserId: 'user-a',
      bunshinId,
    });
    expect(m.repository).toHaveBeenCalledWith(undefined, 'service-b');
    expect(m.settings).toHaveBeenCalledWith({
      workspaceId: 'workspace-b',
      groupId: 'service-b',
      actorUserId: 'user-a',
    });
    expect(m.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        officialProduct: official,
        product: { name: product.name, appealPoint: product.appealPoint, targetAudience: '初心者' },
        bunshin: expect.objectContaining({
          name: bunshin.name,
          tone: 'やさしい',
          forbiddenExpressions: ['絶対'],
        }),
      }),
    );
    expect(JSON.stringify(m.generate.mock.calls)).not.toContain('agency.example');
    expect(m.quota).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-b',
        groupId: 'service-b',
        operationKey: `${requestId}:member-product-suggestions`,
      }),
    );
    expect(m.usage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-b',
        bunshinId,
        actorUserId: 'user-a',
        status: 'SUCCESS',
        model: 'configured-model',
        promptVersion: 'member-product-suggestions-v2',
        inputTokens: 100,
        outputTokens: 60,
        estimatedCostUsdMicros: 123,
        latencyMs: 20,
      }),
    );
    expect(m.generation).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-b',
        groupId: 'service-b',
        actorUserId: 'user-a',
        profileId: id,
        bunshinId,
        externalTrackingLinkId: linkId,
        productPackId: id,
        candidateCount: 3,
      }),
    );
    const data = (await response.json()).data;
    expect(data.activityId).toBe('activity-a');
    expect(data.candidates).toHaveLength(3);
    for (const candidate of data.candidates) {
      expect(candidate.body).toContain('提供：公式社');
      expect(candidate.body).toContain('#PR');
      expect(candidate.body).toContain('https://agency.example/member-a');
    }
  });
  it.each(['DRAFT', 'SUSPENDED', 'missing'])('does not generate using %s links', async (status) => {
    m.settings.mockResolvedValue({
      systems: [],
      links:
        status === 'missing'
          ? []
          : [{ id: linkId, status, url: 'https://agency.example/member-a' }],
    });
    expect(
      (await generateMemberProductSuggestionsResponse(request(input), 'private-a')).status,
    ).toBe(404);
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.quota).not.toHaveBeenCalled();
    expect(m.generation).not.toHaveBeenCalled();
  });
  it('refuses unavailable member link settings', async () => {
    m.settings.mockResolvedValue(null);
    expect(
      (await generateMemberProductSuggestionsResponse(request(input), 'private-a')).status,
    ).toBe(404);
    expect(m.generate).not.toHaveBeenCalled();
  });
  it('refuses a foreign or unpublished official product before generation', async () => {
    m.profile.mockResolvedValue({ ...profile, productPackId: id });
    expect(
      (await generateMemberProductSuggestionsResponse(request(input), 'private-a')).status,
    ).toBe(422);
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.generation).not.toHaveBeenCalled();
  });
  it('refuses an unavailable or foreign Bunshin before generation', async () => {
    m.find.mockResolvedValue(null);
    expect(
      (await generateMemberProductSuggestionsResponse(request(input), 'private-a')).status,
    ).toBe(404);
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.generation).not.toHaveBeenCalled();
  });
  it('does not call a provider when the current service quota rejects', async () => {
    m.quota.mockRejectedValue(new ApplicationError('FORBIDDEN', 'service limit reached'));
    expect(
      (await generateMemberProductSuggestionsResponse(request(input), 'private-a')).status,
    ).toBe(403);
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.generation).not.toHaveBeenCalled();
  });
  it.each(['https://unapproved.example', '絶対おすすめ', '必ず効く'])(
    'rejects unsafe candidate %s without publishing or activity',
    async (draft) => {
      m.profile.mockResolvedValue({ ...profile, productPackId: id, officialProduct: official });
      m.generate.mockResolvedValue({
        candidates: [draft],
        model: 'configured-model',
        promptVersion: 'member-product-suggestions-v2',
      });
      const response = await generateMemberProductSuggestionsResponse(request(input), 'private-a');
      expect(response.status).toBe(422);
      expect((await response.json()).data).toBeUndefined();
      expect(m.generation).not.toHaveBeenCalled();
      expect(m.usage).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'FAILED',
          errorCode: 'CONTENT_REJECTED',
          workspaceId: 'workspace-a',
          actorUserId: 'user-a',
          bunshinId,
        }),
      );
    },
  );
  it('records a failed provider attempt without publishing a partial draft', async () => {
    m.generate.mockRejectedValue(new Error('mock provider unavailable'));
    const response = await generateMemberProductSuggestionsResponse(request(input), 'private-a');
    expect(response.status).toBe(500);
    expect((await response.json()).data).toBeUndefined();
    expect(m.generation).not.toHaveBeenCalled();
    expect(m.usage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        model: 'configured-model',
        promptVersion: 'member-product-suggestions-v2',
        estimatedCostUsdMicros: 123,
      }),
    );
  });
});
