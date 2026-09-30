import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  member: vi.fn(),
  public: vi.fn(),
  assign: vi.fn(),
  capability: vi.fn(),
  bunshin: vi.fn(),
  profiles: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setActive: vi.fn(),
    findByPlatform: vi.fn(),
  },
  pillars: {
    list: vi.fn(),
    create: vi.fn(),
    find: vi.fn(),
    update: vi.fn(),
    setActive: vi.fn(),
    delete: vi.fn(),
  },
  strategies: { list: vi.fn(), approve: vi.fn(), createVersion: vi.fn() },
  plans: { list: vi.fn(), confirmPlan: vi.fn(), expirePlan: vi.fn() },
  knowledge: vi.fn(),
  weeklyGenerate: vi.fn(),
  strategyGenerate: vi.fn(),
  runtime: vi.fn(),
  usage: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.com' }),
}));
vi.mock('@bunshin/observability', () => ({
  requestIdFromHeader: () => 'request-a',
  createLogger: () => ({ child: () => ({ info: vi.fn(), error: vi.fn() }) }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({
  resolveMemberServiceContext: m.member,
  resolvePublicServiceContext: m.public,
}));
vi.mock('@bunshin/database', () => ({
  PrismaBunshinCapabilityAssignmentRepository: class {
    assign = m.assign;
    find = m.capability;
  },
  PrismaBunshinRepository: class {
    find = m.bunshin;
  },
  PrismaSocialProfileRepository: class {
    list = m.profiles.list;
    create = m.profiles.create;
    update = m.profiles.update;
    setActive = m.profiles.setActive;
    findByPlatform = m.profiles.findByPlatform;
  },
  PrismaContentPillarRepository: class {
    list = m.pillars.list;
    create = m.pillars.create;
    find = m.pillars.find;
    update = m.pillars.update;
    setActive = m.pillars.setActive;
    softDelete = m.pillars.delete;
  },
  PrismaSocialAccountStrategyRepository: class {
    list = m.strategies.list;
    approve = m.strategies.approve;
    createVersion = m.strategies.createVersion;
  },
  PrismaWeeklyPlanRepository: class {
    listPlans = m.plans.list;
    confirmPlan = m.plans.confirmPlan;
    expirePlan = m.plans.expirePlan;
  },
}));
vi.mock('../src/services/weekly-plan-generation', () => ({
  createWeeklyPlanGenerationService: () => Promise.resolve({ execute: m.weeklyGenerate }),
}));
vi.mock('../src/services/service-generation-knowledge', () => ({
  loadServiceGenerationKnowledge: m.knowledge,
}));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  resolveOpenAiRuntimeConfiguration: m.runtime,
}));
vi.mock('../src/providers/openai-strategy-generator', () => ({
  OpenAIStrategyGenerator: class {
    generate = m.strategyGenerate;
  },
}));
vi.mock('../src/observability/ai-usage', () => ({ recordAiUsageSafely: m.usage }));
vi.mock('../src/organization-ai-generation-quota', () => ({
  withOrganizationAiGenerationQuota: ({ generate }: { generate: () => Promise<unknown> }) =>
    generate(),
}));
import {
  createServiceSocialProfileResponse,
  listServiceSocialProfilesResponse,
  updateServiceSocialProfileResponse,
  setServiceSocialProfileActiveResponse,
} from '../src/http/service-social-profiles';
import {
  createServiceContentPillarResponse,
  listServiceContentPillarsResponse,
  getServiceContentPillarResponse,
  updateServiceContentPillarResponse,
  setServiceContentPillarActiveResponse,
  deleteServiceContentPillarResponse,
} from '../src/http/service-content-pillars';
import {
  listServiceWeeklyPlansResponse,
  generateServiceWeeklyPlanResponse,
  setServiceWeeklyPlanStatusResponse,
} from '../src/http/service-weekly-plans';
import {
  listServiceAccountStrategiesResponse,
  generateServiceAccountStrategyResponse,
  approveServiceAccountStrategyResponse,
} from '../src/http/service-account-strategies';

const id = '00000000-0000-4000-8000-000000000001';
const profileBody = {
  platform: 'X',
  purpose: 'LINEへの参加案内',
  postingFrequency: 'DAILY',
  preferredFormats: ['TEXT'],
};
const pillarBody = { title: '紹介', weight: 1 };
const weeklyBody = { socialProfileId: id, weekStartDate: '2026-09-28', timezone: 'Asia/Tokyo' };
const strategyBody = {
  socialProfileId: id,
  platform: 'X',
  goal: 'LINE_REGISTRATION',
  availableMinutes: 5,
  destinationType: 'LINE',
  wizardTopic: 'サービス案内',
  wizardAudience: '参加希望者',
};
const dates = { createdAt: new Date(), updatedAt: new Date() };
const profile = { id, ...profileBody, handle: null, profileUrl: null, status: 'ACTIVE' };
const pillar = { id, ...pillarBody, description: null, active: true };
const plan = {
  id,
  ...weeklyBody,
  ...dates,
  status: 'PROPOSED',
  items: [],
  confirmedAt: null,
  expiredAt: null,
};
const strategyOutput = {
  concept: '紹介',
  positioning: '本人らしく',
  targetSummary: '参加希望者',
  profileDraft: '紹介します',
  ctaStrategy: 'LINE参加',
  postingPolicy: '毎日',
};
const strategy = {
  id,
  ...strategyBody,
  ...strategyOutput,
  ...dates,
  approvedAt: null,
  supersededAt: null,
};
function request(value: unknown, origin = 'https://example.com') {
  return new Request('https://example.com/api/services/private-a/planning', {
    method: value === undefined ? 'DELETE' : 'POST',
    headers: { origin, 'content-type': 'application/json' },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
}
const operations: Array<{
  name: string;
  read?: boolean;
  body: Record<string, unknown> | undefined;
  repo: ReturnType<typeof vi.fn>;
  run: (request: Request, serviceSlug: string, bunshinId: string) => Promise<Response>;
  status?: number;
}> = [
  {
    name: 'profile list',
    read: true,
    body: {},
    repo: m.profiles.list,
    run: listServiceSocialProfilesResponse,
  },
  {
    name: 'profile create',
    body: profileBody,
    repo: m.profiles.create,
    run: createServiceSocialProfileResponse,
    status: 201,
  },
  {
    name: 'profile edit',
    body: { purpose: '更新' },
    repo: m.profiles.update,
    run: (r: Request, s: string, b: string) => updateServiceSocialProfileResponse(r, s, b, 'X'),
  },
  ...[true, false].map((active) => ({
    name: `profile active ${active}`,
    body: {},
    repo: m.profiles.setActive,
    run: (r: Request, s: string, b: string) =>
      setServiceSocialProfileActiveResponse(r, s, b, 'X', active),
  })),
  {
    name: 'theme list',
    read: true,
    body: {},
    repo: m.pillars.list,
    run: listServiceContentPillarsResponse,
  },
  {
    name: 'theme create',
    body: pillarBody,
    repo: m.pillars.create,
    run: createServiceContentPillarResponse,
    status: 201,
  },
  {
    name: 'theme get',
    read: true,
    body: {},
    repo: m.pillars.find,
    run: (r: Request, s: string, b: string) => getServiceContentPillarResponse(r, s, b, id),
  },
  {
    name: 'theme edit',
    body: pillarBody,
    repo: m.pillars.update,
    run: (r: Request, s: string, b: string) => updateServiceContentPillarResponse(r, s, b, id),
  },
  ...[true, false].map((active) => ({
    name: `theme active ${active}`,
    body: {},
    repo: m.pillars.setActive,
    run: (r: Request, s: string, b: string) =>
      setServiceContentPillarActiveResponse(r, s, b, id, active),
  })),
  {
    name: 'theme delete',
    body: undefined,
    repo: m.pillars.delete,
    run: (r: Request, s: string, b: string) => deleteServiceContentPillarResponse(r, s, b, id),
  },
  {
    name: 'strategy list',
    read: true,
    body: {},
    repo: m.strategies.list,
    run: (r: Request, s: string, b: string) => listServiceAccountStrategiesResponse(r, s, b, id),
  },
  {
    name: 'strategy approve',
    body: {},
    repo: m.strategies.approve,
    run: (r: Request, s: string, b: string) => approveServiceAccountStrategyResponse(r, s, b, id),
  },
  {
    name: 'strategy generate',
    body: strategyBody,
    repo: m.strategies.createVersion,
    run: generateServiceAccountStrategyResponse,
    status: 201,
  },
  {
    name: 'weekly list',
    read: true,
    body: {},
    repo: m.plans.list,
    run: listServiceWeeklyPlansResponse,
  },
  ...(['confirm', 'expire'] as const).map((action) => ({
    name: `weekly ${action}`,
    body: {},
    repo: action === 'confirm' ? m.plans.confirmPlan : m.plans.expirePlan,
    run: (r: Request, s: string, b: string) =>
      setServiceWeeklyPlanStatusResponse(r, s, b, id, action),
  })),
  {
    name: 'weekly generate',
    body: weeklyBody,
    repo: m.weeklyGenerate,
    run: generateServiceWeeklyPlanResponse,
    status: 201,
  },
];
function allRepositories() {
  return [
    ...Object.values(m.profiles),
    ...Object.values(m.pillars),
    ...Object.values(m.strategies),
    ...Object.values(m.plans),
    m.assign,
    m.bunshin,
    m.weeklyGenerate,
  ];
}
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: 'member-a' });
  m.member.mockResolvedValue({ workspaceId: 'workspace-a', serviceId: 'service-a' });
  m.public.mockRejectedValue(new ApplicationError('NOT_FOUND', 'private service'));
  m.assign.mockResolvedValue({ status: 'ACTIVE' });
  m.capability.mockResolvedValue({ status: 'ACTIVE' });
  m.bunshin.mockResolvedValue({
    name: 'partner',
    objectives: [],
    audiences: [],
    personality: null,
  });
  for (const fn of Object.values(m.profiles)) fn.mockResolvedValue(profile);
  m.profiles.list.mockResolvedValue([profile]);
  for (const fn of Object.values(m.pillars)) fn.mockResolvedValue(pillar);
  m.pillars.list.mockResolvedValue([pillar]);
  for (const fn of Object.values(m.strategies)) fn.mockResolvedValue(strategy);
  m.strategies.list.mockResolvedValue([strategy]);
  for (const fn of Object.values(m.plans)) fn.mockResolvedValue(plan);
  m.plans.list.mockResolvedValue([plan]);
  m.weeklyGenerate.mockResolvedValue({ plan, titles: new Map() });
  m.knowledge.mockResolvedValue({
    officialKnowledge: [{ title: '自サービスの知識' }],
    contentTerminologyPolicy: null,
    businessContentMixEnabled: false,
  });
  m.runtime.mockResolvedValue({ apiKey: 'test-only-placeholder', model: 'mock-model' });
  m.strategyGenerate.mockResolvedValue({
    output: strategyOutput,
    model: 'mock-model',
    promptVersion: 'v1',
    latencyMs: 1,
    inputTokens: 1,
    outputTokens: 1,
  });
});
describe('private service social planning HTTP operations', () => {
  it.each(operations)('allows $name with member-resolved scope', async (op) => {
    const result = await op.run(request(op.body), 'private-a', 'bunshin-a');
    expect(result.status).toBe(op.status ?? 200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(m.member).toHaveBeenCalledWith('private-a', 'member-a');
    expect(m.actor.mock.invocationCallOrder[0]).toBeLessThan(m.member.mock.invocationCallOrder[0]!);
    expect(m.public).not.toHaveBeenCalled();
    expect(op.repo).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        actorUserId: 'member-a',
        bunshinId: 'bunshin-a',
      }),
    );
  });
  it.each(operations)('rejects anonymous $name before scope or repository access', async (op) => {
    m.actor.mockResolvedValue(null);
    expect((await op.run(request(op.body), 'private-a', 'bunshin-a')).status).toBe(401);
    expect(m.member).not.toHaveBeenCalled();
    for (const fn of allRepositories()) expect(fn).not.toHaveBeenCalled();
    expect(m.knowledge).not.toHaveBeenCalled();
    expect(m.runtime).not.toHaveBeenCalled();
  });
  it.each(operations)('rejects $name for nonmembers or unavailable services', async (op) => {
    m.member.mockRejectedValue(new ApplicationError('NOT_FOUND', 'service not found'));
    expect((await op.run(request(op.body), 'other', 'bunshin-a')).status).toBe(404);
    for (const fn of allRepositories()) expect(fn).not.toHaveBeenCalled();
    expect(m.strategyGenerate).not.toHaveBeenCalled();
  });
  it.each(operations)('keeps $name isolated after switching service and partner', async (op) => {
    m.member.mockResolvedValue({ workspaceId: 'workspace-b', serviceId: 'service-b' });
    expect((await op.run(request(op.body), 'private-b', 'bunshin-b')).status).toBe(
      op.status ?? 200,
    );
    expect(op.repo).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-b',
        groupId: 'service-b',
        actorUserId: 'member-a',
        bunshinId: 'bunshin-b',
      }),
    );
  });
  it.each(operations.filter((op) => !op.read))(
    'rejects cross-origin $name before writes or AI',
    async (op) => {
      expect(
        (await op.run(request(op.body, 'https://attacker.example'), 'private-a', 'bunshin-a'))
          .status,
      ).toBe(403);
      expect(m.member).not.toHaveBeenCalled();
      for (const fn of allRepositories()) expect(fn).not.toHaveBeenCalled();
      expect(m.strategyGenerate).not.toHaveBeenCalled();
    },
  );
  it.each(operations.filter((op) => !op.read && op.body !== undefined))(
    'rejects scope injection in $name',
    async (op) => {
      for (const key of ['workspaceId', 'groupId', 'actorUserId', 'bunshinId']) {
        expect(
          (await op.run(request({ ...op.body, [key]: 'other' }), 'private-a', 'bunshin-a')).status,
        ).toBe(400);
      }
      for (const fn of allRepositories()) expect(fn).not.toHaveBeenCalled();
    },
  );
  it.each(operations.filter((op) => !op.name.includes('generate')))(
    'preserves repository ownership refusal for $name',
    async (op) => {
      op.repo.mockResolvedValue(null);
      expect((await op.run(request(op.body), 'private-a', 'foreign-partner')).status).toBe(404);
    },
  );
  it.each(operations.filter((op) => !op.read && !op.name.includes('generate')))(
    'requires active SOCIAL capability for $name',
    async (op) => {
      m.capability.mockResolvedValue({ status: 'SUSPENDED' });
      expect((await op.run(request(op.body), 'private-a', 'bunshin-a')).status).toBe(403);
      expect(op.repo).not.toHaveBeenCalled();
    },
  );
  it('keeps weekly knowledge, campaign policy and idempotency scoped', async () => {
    expect(
      (await generateServiceWeeklyPlanResponse(request(weeklyBody), 'private-a', 'bunshin-a'))
        .status,
    ).toBe(201);
    expect(m.knowledge).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      groupId: 'service-a',
      actorUserId: 'member-a',
    });
    expect(m.weeklyGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        includeGrantedKnowledge: false,
        includeCampaigns: true,
        existingPolicy: 'CONFLICT',
        usageIdempotencyKey: 'request-a:service-weekly-plan',
        additionalKnowledge: [{ title: '自サービスの知識' }],
        transformGeneratedOutput: expect.any(Function),
      }),
    );
  });
  it('uses this service official knowledge for strategy generation only', async () => {
    expect(
      (
        await generateServiceAccountStrategyResponse(
          request(strategyBody),
          'private-a',
          'bunshin-a',
        )
      ).status,
    ).toBe(201);
    expect(m.bunshin).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      groupId: 'service-a',
      actorUserId: 'member-a',
      bunshinId: 'bunshin-a',
    });
    expect(m.strategyGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ grantedKnowledge: [{ title: '自サービスの知識' }] }),
    );
  });
  it('rejects a foreign social profile before strategy provider access', async () => {
    m.profiles.findByPlatform.mockResolvedValue({ ...profile, id: 'other-profile' });
    expect(
      (
        await generateServiceAccountStrategyResponse(
          request(strategyBody),
          'private-a',
          'bunshin-a',
        )
      ).status,
    ).toBe(404);
    expect(m.strategyGenerate).not.toHaveBeenCalled();
    expect(m.strategies.createVersion).not.toHaveBeenCalled();
  });
  it('preserves confirmed-plan theme protection and weekly generation conflicts', async () => {
    m.pillars.delete.mockRejectedValue(
      new ApplicationError('CONFLICT', 'confirmed plan reference'),
    );
    expect(
      (await deleteServiceContentPillarResponse(request(undefined), 'private-a', 'bunshin-a', id))
        .status,
    ).toBe(409);
    m.weeklyGenerate.mockRejectedValue(new ApplicationError('CONFLICT', 'existing plan'));
    expect(
      (await generateServiceWeeklyPlanResponse(request(weeklyBody), 'private-a', 'bunshin-a'))
        .status,
    ).toBe(409);
  });
  it('continues using member authorization for public services too', async () => {
    expect(
      (await listServiceWeeklyPlansResponse(request({}), 'public-service', 'bunshin-a')).status,
    ).toBe(200);
    expect(m.member).toHaveBeenCalledWith('public-service', 'member-a');
    expect(m.public).not.toHaveBeenCalled();
  });
});
