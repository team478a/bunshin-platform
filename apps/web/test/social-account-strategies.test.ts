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
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaSocialAccountStrategyRepository: class {
    createVersion = state.create;
    list = state.list;
    approve = state.approve;
  },
  PrismaBunshinCapabilityAssignmentRepository: class {
    find = state.assignment;
  },
}));
import {
  approveSocialAccountStrategyResponse,
  createSocialAccountStrategyResponse,
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
