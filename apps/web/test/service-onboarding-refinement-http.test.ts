import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: null as { userId: string } | null,
  resolve: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: state.resolve }));
vi.mock('@bunshin/database', () => ({
  prisma: {
    serviceOnboardingResponse: { findFirst: state.findFirst, updateMany: state.updateMany },
  },
}));

import { deferServiceOnboardingRefinement } from '../src/http/service-onboarding-refinement';
import { deferOnboardingRefinement } from '../src/services/service-onboarding-response';

const now = new Date();
const fixture = () => ({
  id: 'response-a',
  groupMembershipId: 'membership-a',
  updatedAt: now,
  answers: [{ question: '目的は？', answer: 'まだ回答していません' }],
  refinementState: {},
  nextRefinementAt: null as Date | null,
});
const request = (body: unknown = { question: '目的は？' }, origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/services/hassy/onboarding/refinement', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('onboarding refinement HTTP ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    state.user = { userId: 'user-a' };
    state.resolve.mockResolvedValue({
      workspaceId: 'workspace-a',
      serviceId: 'group-a',
      configuration: {
        registration: { onboardingConfig: {}, surveyConfig: { questions: ['目的は？'] } },
      },
    });
    state.findFirst.mockResolvedValue(fixture());
    state.updateMany.mockResolvedValue({ count: 1 });
  });

  it('binds reads and compare-and-set writes to the authenticated active owner', async () => {
    const response = await deferServiceOnboardingRefinement(request(), 'hassy');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(state.resolve).toHaveBeenCalledWith('hassy', 'user-a');
    const owner = {
      workspaceId: 'workspace-a',
      groupId: 'group-a',
      userId: 'user-a',
      groupMembership: {
        status: 'ACTIVE',
        group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      },
    };
    expect(state.findFirst.mock.calls[0]?.[0].where).toEqual(owner);
    expect(state.updateMany.mock.calls[0]?.[0].where).toEqual({
      ...owner,
      id: 'response-a',
      groupMembershipId: 'membership-a',
      updatedAt: now,
    });
    expect(state.updateMany.mock.calls[0]?.[0].data).not.toHaveProperty('answers');
  });

  it('rejects missing sessions, cross-origin requests and forged ownership fields', async () => {
    state.user = null;
    expect((await deferServiceOnboardingRefinement(request(), 'hassy')).status).toBe(401);
    state.user = { userId: 'user-a' };
    expect(
      (await deferServiceOnboardingRefinement(request({}, 'https://evil.example'), 'hassy')).status,
    ).toBe(403);
    expect(
      (
        await deferServiceOnboardingRefinement(
          request({ question: '目的は？', userId: 'user-b' }),
          'hassy',
        )
      ).status,
    ).toBe(400);
    expect(state.updateMany).not.toHaveBeenCalled();
  });

  it('cannot update another owner or an inactive membership', async () => {
    state.findFirst.mockResolvedValue(null);
    expect((await deferServiceOnboardingRefinement(request(), 'hassy')).status).toBe(403);
    expect(state.updateMany).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and missing JSON content type as validation errors', async () => {
    const invalid = new Request('http://localhost:3000/api/services/hassy/onboarding/refinement', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: '{',
    });
    expect((await deferServiceOnboardingRefinement(invalid, 'hassy')).status).toBe(400);
    const noType = new Request('http://localhost:3000/api/services/hassy/onboarding/refinement', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
      body: '{}',
    });
    expect((await deferServiceOnboardingRefinement(noType, 'hassy')).status).toBe(400);
    expect(state.updateMany).not.toHaveBeenCalled();
  });

  it('returns success without another write for an already committed deferral', async () => {
    state.findFirst.mockResolvedValue({
      ...fixture(),
      refinementState: deferOnboardingRefinement(['目的は？'], '目的は？', {}, new Date()),
      nextRefinementAt: new Date(Date.now() + 86400000),
    });
    expect((await deferServiceOnboardingRefinement(request(), 'hassy')).status).toBe(200);
    expect(state.updateMany).not.toHaveBeenCalled();
  });

  it('rejects answered, removed or cooling-down questions', async () => {
    expect(
      (await deferServiceOnboardingRefinement(request({ question: 'removed' }), 'hassy')).status,
    ).toBe(409);
    state.findFirst.mockResolvedValue({
      ...fixture(),
      answers: [{ question: '目的は？', answer: '集客したい' }],
    });
    expect((await deferServiceOnboardingRefinement(request(), 'hassy')).status).toBe(409);
    state.findFirst.mockResolvedValue({
      ...fixture(),
      nextRefinementAt: new Date(Date.now() + 86400000),
    });
    expect((await deferServiceOnboardingRefinement(request(), 'hassy')).status).toBe(409);
    expect(state.updateMany).not.toHaveBeenCalled();
  });

  it('does not overwrite a concurrently saved answer', async () => {
    state.updateMany.mockResolvedValue({ count: 0 });
    expect((await deferServiceOnboardingRefinement(request(), 'hassy')).status).toBe(409);
  });

  it('reports database failures without leaking exception details', async () => {
    state.updateMany.mockRejectedValue(new Error('private database detail'));
    const response = await deferServiceOnboardingRefinement(request(), 'hassy');
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private database detail');
  });
});
