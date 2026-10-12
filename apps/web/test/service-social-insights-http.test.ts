import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  member: vi.fn(),
  membership: vi.fn(),
  bunshin: vi.fn(),
  profile: vi.fn(),
  mission: vi.fn(),
  snapshot: vi.fn(),
  update: vi.fn(),
  extract: vi.fn(),
  runtime: vi.fn(),
  usage: vi.fn(),
  usageStrict: vi.fn(),
  settle: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.com' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: m.member }));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  reserveOpenAiRuntimeConfiguration: m.runtime,
  settleProviderRuntimeAdmission: m.settle,
}));
vi.mock('../src/observability/ai-usage', () => ({
  recordAiUsage: m.usageStrict,
  recordAiUsageSafely: m.usage,
}));
vi.mock('../src/providers/openai-social-insight-extractor', () => ({
  OpenAiSocialInsightExtractor: class {
    extract = m.extract;
  },
  SOCIAL_INSIGHT_EXTRACTION_PROMPT_VERSION: 'mock-v1',
  SocialInsightExtractionError: class extends Error {},
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    groupMembership: { findFirst: m.membership },
    bunshin: { findFirst: m.bunshin },
    socialProfile: { findFirst: m.profile },
    dailyMission: { findFirst: m.mission },
    socialInsightSnapshot: { upsert: m.snapshot },
    postRecord: { update: m.update },
  },
}));
import {
  extractServiceSocialInsightResponse,
  saveServiceSocialInsightResponse,
  saveServicePostPerformanceResponse,
} from '../src/http/service-social-insights';
const id = '00000000-0000-4000-8000-000000000001';
const admission = {
  id: '33333333-3333-4333-8333-333333333333',
  environment: 'DEVELOPMENT',
  provider: 'OPENAI',
  operationHash: 'a'.repeat(64),
} as const;
const insightBody = {
  socialProfileId: id,
  observedOn: '2026-09-29',
  periodStart: null,
  periodEnd: null,
  followers: 10,
  reach: null,
  impressions: null,
  profileViews: null,
  interactions: null,
  source: 'MANUAL',
};
const postBody = {
  dailyMissionId: id,
  observedOn: '2026-09-29',
  reach: 10,
  impressions: null,
  likes: null,
  comments: null,
  saves: null,
  shares: null,
  profileViews: null,
  follows: null,
  source: 'MANUAL',
};
const extractBody = {
  image: `data:image/png;base64,${Buffer.alloc(100, 1).toString('base64')}`,
  idempotencyKey: id,
};
function context(enabled = true, workspaceId = 'workspace-a', serviceId = 'service-a') {
  return {
    workspaceId,
    serviceId,
    configuration: {
      registration: { onboardingConfig: { businessProfileEnabled: enabled }, surveyConfig: {} },
    },
  };
}
function request(body: unknown, origin = 'https://example.com') {
  return new Request('https://example.com/api/services/private-a/insights', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const operations = [
  {
    name: 'account metrics',
    body: insightBody,
    run: saveServiceSocialInsightResponse,
    effect: m.snapshot,
  },
  {
    name: 'post metrics',
    body: postBody,
    run: saveServicePostPerformanceResponse,
    effect: m.update,
  },
  {
    name: 'screenshot extraction',
    body: extractBody,
    run: extractServiceSocialInsightResponse,
    effect: m.extract,
  },
];
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: 'member-a' });
  m.member.mockResolvedValue(context());
  m.membership.mockResolvedValue({ id: 'membership-a' });
  m.bunshin.mockResolvedValue({ id: 'bunshin-a' });
  m.profile.mockResolvedValue({ id, platform: 'X' });
  m.mission.mockResolvedValue({
    id,
    topic: '自分の投稿',
    postRecord: {
      id: 'post-a',
      actorUserId: 'member-a',
      postedAt: new Date(),
      manualMetrics: { existing: 1 },
    },
  });
  m.snapshot.mockImplementation(({ create }: { create: Record<string, unknown> }) =>
    Promise.resolve({ id: 'snapshot-a', ...create }),
  );
  m.runtime.mockResolvedValue({
    apiKey: 'test-placeholder',
    model: 'mock-model',
    requestCostUsdMicros: 250,
    admission,
  });
  m.usage.mockResolvedValue(undefined);
  m.usageStrict.mockResolvedValue(undefined);
  m.settle.mockResolvedValue(undefined);
  m.extract.mockResolvedValue({
    extraction: { followers: 10 },
    model: 'mock-model',
    promptVersion: 'mock-v1',
    latencyMs: 1,
    inputTokens: 1,
    outputTokens: 1,
  });
});
describe('private service metrics scope', () => {
  it.each(operations)('permits $name for this private service member', async (op) => {
    expect((await op.run(request(op.body), 'private-a', 'bunshin-a')).status).toBe(200);
    expect(m.member).toHaveBeenCalledWith('private-a', 'member-a');
    expect(m.actor.mock.invocationCallOrder[0]).toBeLessThan(m.member.mock.invocationCallOrder[0]!);
    expect(m.membership).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-a',
          groupId: 'service-a',
          userId: 'member-a',
          status: 'ACTIVE',
          consentedAt: { not: null },
        },
      }),
    );
    expect(m.bunshin).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-a',
          groupId: 'service-a',
          ownerUserId: 'member-a',
          id: 'bunshin-a',
        }),
      }),
    );
    expect(op.effect).toHaveBeenCalledOnce();
  });
  it.each(operations)('rejects anonymous $name before scope lookup', async (op) => {
    m.actor.mockResolvedValue(null);
    expect((await op.run(request(op.body), 'private-a', 'bunshin-a')).status).toBe(401);
    expect(m.member).not.toHaveBeenCalled();
    expect(op.effect).not.toHaveBeenCalled();
  });
  it.each(operations)('rejects $name when membership/service resolution is denied', async (op) => {
    m.member.mockRejectedValue(new ApplicationError('NOT_FOUND', 'service not found'));
    expect((await op.run(request(op.body), 'other', 'bunshin-a')).status).toBe(404);
    expect(m.membership).not.toHaveBeenCalled();
    expect(op.effect).not.toHaveBeenCalled();
  });
  it.each(operations)('retains project-specific feature restrictions for $name', async (op) => {
    m.member.mockResolvedValue(context(false));
    expect((await op.run(request(op.body), 'sennokuni', 'bunshin-a')).status).toBe(403);
    expect(op.effect).not.toHaveBeenCalled();
    expect(m.runtime).not.toHaveBeenCalled();
  });
  it.each(operations)('rejects $name without consented membership or owned partner', async (op) => {
    m.membership.mockResolvedValue(null);
    expect((await op.run(request(op.body), 'private-a', 'bunshin-a')).status).toBe(404);
    m.membership.mockResolvedValue({ id: 'membership-a' });
    m.bunshin.mockResolvedValue(null);
    expect((await op.run(request(op.body), 'private-a', 'foreign')).status).toBe(404);
    expect(op.effect).not.toHaveBeenCalled();
  });
  it.each(operations)('does not reuse another project scope for $name', async (op) => {
    m.member.mockResolvedValue(context(true, 'workspace-b', 'service-b'));
    expect((await op.run(request(op.body), 'private-b', 'bunshin-b')).status).toBe(200);
    expect(m.bunshin).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-b',
          groupId: 'service-b',
          id: 'bunshin-b',
          ownerUserId: 'member-a',
        }),
      }),
    );
  });
  it.each(operations)('rejects cross-origin $name before writes or extraction', async (op) => {
    expect(
      (await op.run(request(op.body, 'https://attacker.example'), 'private-a', 'bunshin-a')).status,
    ).toBe(403);
    expect(m.member).not.toHaveBeenCalled();
    expect(op.effect).not.toHaveBeenCalled();
  });
  it.each(operations)('rejects ID injection into $name', async (op) => {
    expect(
      (await op.run(request({ ...op.body, groupId: 'other' }), 'private-a', 'bunshin-a')).status,
    ).toBe(400);
    expect(op.effect).not.toHaveBeenCalled();
  });
  it('requires this actors posted mission before metrics updates', async () => {
    m.mission.mockResolvedValue({ id, postRecord: { actorUserId: 'other' } });
    expect(
      (await saveServicePostPerformanceResponse(request(postBody), 'private-a', 'bunshin-a'))
        .status,
    ).toBe(404);
    expect(m.update).not.toHaveBeenCalled();
  });
  it('keeps account snapshot and AI usage attribution in the project', async () => {
    await saveServiceSocialInsightResponse(request(insightBody), 'private-a', 'bunshin-a');
    expect(m.snapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workspaceId: 'workspace-a',
          groupId: 'service-a',
          userId: 'member-a',
          groupMembershipId: 'membership-a',
          bunshinId: 'bunshin-a',
        }),
      }),
    );
    await extractServiceSocialInsightResponse(request(extractBody), 'private-a', 'bunshin-a');
    expect(m.runtime).toHaveBeenCalledWith(`social-insight:${id}`);
    expect(m.usageStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        bunshinId: 'bunshin-a',
        actorUserId: 'member-a',
        estimatedCostUsdMicros: 250,
        pricingVersion: 'admin-request-cost-v1',
        idempotencyKey: `social-insight:${id}`,
      }),
    );
    expect(m.settle).toHaveBeenCalledWith(admission);
    expect(m.usageStrict.mock.invocationCallOrder[0]).toBeLessThan(
      m.settle.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('records and settles a failed Provider attempt at the configured request cost', async () => {
    m.extract.mockRejectedValue(new Error('synthetic provider failure'));

    expect(
      (await extractServiceSocialInsightResponse(request(extractBody), 'private-a', 'bunshin-a'))
        .status,
    ).toBe(500);

    expect(m.usageStrict).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', estimatedCostUsdMicros: 250 }),
    );
    expect(m.settle).toHaveBeenCalledWith(admission);
  });

  it('leaves the admission open when strict usage persistence fails', async () => {
    m.usageStrict.mockRejectedValue(new Error('synthetic usage persistence failure'));

    expect(
      (await extractServiceSocialInsightResponse(request(extractBody), 'private-a', 'bunshin-a'))
        .status,
    ).toBe(500);

    expect(m.usageStrict).toHaveBeenCalledOnce();
    expect(m.settle).not.toHaveBeenCalled();
  });

  it('keeps the bounded non-production legacy fallback best-effort and reservation-free', async () => {
    m.runtime.mockResolvedValue({
      apiKey: 'test-placeholder',
      model: 'mock-model',
      requestCostUsdMicros: 250,
      admission: null,
    });

    expect(
      (await extractServiceSocialInsightResponse(request(extractBody), 'private-a', 'bunshin-a'))
        .status,
    ).toBe(200);

    expect(m.usage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SUCCESS', estimatedCostUsdMicros: 250 }),
    );
    expect(m.usageStrict).not.toHaveBeenCalled();
    expect(m.settle).not.toHaveBeenCalled();
  });
});
