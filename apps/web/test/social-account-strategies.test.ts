import type { SocialAccountStrategy } from '@bunshin/capability-social';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const now = new Date('2026-08-20T00:00:00Z');
const strategy: SocialAccountStrategy = {
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  socialProfileId: '22222222-2222-4222-8222-222222222222',
  platform: 'THREADS',
  goal: 'FOLLOWERS',
  availableMinutes: 5,
  destinationType: 'PROFILE',
  destinationDetail: null,
  concept: 'topic',
  positioning: 'tone',
  targetSummary: 'audience',
  profileDraft: 'draft',
  ctaStrategy: 'follow',
  postingPolicy: 'daily',
  version: 1,
  status: 'PROPOSED',
  approvedAt: null,
  supersededAt: null,
  createdAt: now,
  updatedAt: now,
};
const state = vi.hoisted(() => ({
  user: null as { userId: string } | null,
  create: vi.fn(),
  list: vi.fn(),
  approve: vi.fn(),
  assignment: vi.fn(),
  bunshin: vi.fn(),
  grantedKnowledge: vi.fn(),
  profile: vi.fn(),
  generate: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaAiProviderConfigurationRepository: class {
    getActiveForRuntime = vi.fn().mockResolvedValue(null);
  },
  PrismaSocialAccountStrategyRepository: class {
    createVersion = state.create;
    list = state.list;
    approve = state.approve;
  },
  PrismaBunshinCapabilityAssignmentRepository: class {
    find = state.assignment;
  },
  PrismaBunshinRepository: class {
    find = state.bunshin;
  },
  PrismaKnowledgeGrantRepository: class {
    listGrantedKnowledge = state.grantedKnowledge;
  },
  PrismaSocialProfileRepository: class {
    findByPlatform = state.profile;
  },
}));
vi.mock('../src/providers/openai-strategy-generator', () => ({
  SOCIAL_ACCOUNT_STRATEGY_PROMPT_VERSION: 'social-account-strategy-v1',
  OpenAIStrategyGenerator: class {
    generate = state.generate;
  },
}));
import {
  approveSocialAccountStrategyResponse,
  createSocialAccountStrategyResponse,
  generateSocialAccountStrategyResponse,
  listSocialAccountStrategiesResponse,
} from '../src/http/social-account-strategies';
const base = '/api/workspaces/workspace-1/bunshins/bunshin-1/social-account-strategies';
function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: { origin: 'http://localhost:3000', ...init?.headers },
  });
}
const payload = {
  socialProfileId: strategy.socialProfileId,
  platform: 'THREADS',
  goal: 'FOLLOWERS',
  availableMinutes: 5,
  destinationType: 'PROFILE',
  concept: 'topic',
  positioning: 'tone',
  targetSummary: 'audience',
  profileDraft: 'draft',
  ctaStrategy: 'follow',
  postingPolicy: 'daily',
};
describe('Account Strategy HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('LOG_LEVEL', 'info');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    state.user = { userId: 'user-1' };
    state.create.mockResolvedValue(strategy);
    state.list.mockResolvedValue([strategy]);
    state.approve.mockResolvedValue({ ...strategy, status: 'APPROVED', approvedAt: now });
    state.assignment.mockResolvedValue({
      id: 'a',
      workspaceId: 'workspace-1',
      bunshinId: 'bunshin-1',
      capabilityType: 'SOCIAL',
      status: 'ACTIVE',
      config: {},
      assignedByUserId: 'user-1',
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    state.bunshin.mockResolvedValue({
      id: 'bunshin-1',
      workspaceId: 'workspace-1',
      ownerUserId: 'user-1',
      name: '専門家Bunshin',
      slug: 'expert',
      status: 'ACTIVE',
      facePolicy: 'FACELESS',
      objectiveSummary: '認知を増やす',
      audienceSummary: '副業初心者',
      personalitySummary: '親しみやすい専門家',
      objectives: [{ id: 'objective-1', title: '認知', priority: 1 }],
      audiences: [{ id: 'audience-1', label: '副業初心者' }],
      personality: { tone: 'FRIENDLY' },
      createdAt: now,
      updatedAt: now,
    });
    state.grantedKnowledge.mockResolvedValue([
      {
        id: 'knowledge-granted',
        workspaceId: 'workspace-1',
        ownerUserId: 'user-1',
        type: 'EXPERTISE',
        title: '専門知識',
        content: '検証済みの知識',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    state.profile.mockResolvedValue({ id: strategy.socialProfileId });
    state.generate.mockResolvedValue({
      output: {
        concept: '専門家の知識を毎日一つ届ける',
        positioning: '親しみやすい実務家',
        targetSummary: '副業を始めたい人',
        profileDraft: '副業初心者向けに実務知識を発信します',
        ctaStrategy: 'プロフィールをフォロー',
        postingPolicy: '1日5分でTEXTを1投稿',
      },
      model: 'gpt-5.2',
      promptVersion: 'social-account-strategy-v1',
      inputTokens: 100,
      outputTokens: 80,
      latencyMs: 200,
    });
  });
  it('creates a proposed strategy from strict wizard input', async () => {
    const response = await createSocialAccountStrategyResponse(
      request(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      'workspace-1',
      'bunshin-1',
    );
    expect(response.status).toBe(201);
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PROPOSED', availableMinutes: 5 }),
    );
  });
  it('lists DTOs without caching', async () => {
    const response = await listSocialAccountStrategiesResponse(
      request(`${base}/profile/${strategy.socialProfileId}`),
      'workspace-1',
      'bunshin-1',
      strategy.socialProfileId,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('approves with same-origin and an empty body', async () => {
    const response = await approveSocialAccountStrategyResponse(
      request(`${base}/${strategy.id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      'workspace-1',
      'bunshin-1',
      strategy.id,
    );
    expect(response.status).toBe(200);
  });
  it('generates from the scoped Bunshin and granted Knowledge only', async () => {
    const response = await generateSocialAccountStrategyResponse(
      request(`${base}/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': 'request-generator' },
        body: JSON.stringify({
          socialProfileId: strategy.socialProfileId,
          platform: 'THREADS',
          goal: 'FOLLOWERS',
          availableMinutes: 5,
          destinationType: 'PROFILE',
          wizardTopic: '副業の始め方',
          wizardAudience: '副業初心者',
        }),
      }),
      'workspace-1',
      'bunshin-1',
    );
    expect(response.status).toBe(201);
    expect(state.bunshin).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      bunshinId: 'bunshin-1',
      actorUserId: 'user-1',
    });
    expect(state.grantedKnowledge).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      bunshinId: 'bunshin-1',
      actorUserId: 'user-1',
    });
    expect(state.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        bunshin: expect.objectContaining({ name: '専門家Bunshin' }),
        grantedKnowledge: [{ type: 'EXPERTISE', title: '専門知識', content: '検証済みの知識' }],
      }),
    );
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PROPOSED', concept: '専門家の知識を毎日一つ届ける' }),
    );
  });
  it('does not generate when the scoped Bunshin is unavailable', async () => {
    state.bunshin.mockResolvedValue(null);
    const response = await generateSocialAccountStrategyResponse(
      request(`${base}/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          socialProfileId: strategy.socialProfileId,
          platform: 'THREADS',
          goal: 'FOLLOWERS',
          availableMinutes: 5,
          destinationType: 'PROFILE',
          wizardTopic: '別Workspaceの話題',
          wizardAudience: '別WorkspaceのAudience',
        }),
      }),
      'other-workspace',
      'bunshin-1',
    );
    expect(response.status).toBe(404);
    expect(state.generate).not.toHaveBeenCalled();
    expect(state.grantedKnowledge).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated and unknown fields', async () => {
    state.user = null;
    expect(
      (
        await listSocialAccountStrategiesResponse(
          request(base),
          'workspace-1',
          'bunshin-1',
          strategy.socialProfileId,
        )
      ).status,
    ).toBe(401);
    state.user = { userId: 'user-1' };
    expect(
      (
        await createSocialAccountStrategyResponse(
          request(base, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...payload, actorUserId: 'attacker' }),
          }),
          'workspace-1',
          'bunshin-1',
        )
      ).status,
    ).toBe(400);
  });
});
