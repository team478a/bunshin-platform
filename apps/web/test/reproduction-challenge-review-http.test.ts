import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import type * as Database from '@bunshin/database';
import { REPRODUCTION_CHALLENGE_REVIEW_FIXTURES } from '@bunshin/capability-training';
const f = vi.hoisted(() => ({
  actor: vi.fn(),
  service: vi.fn(),
  read: vi.fn(),
  change: vi.fn(),
  environment: 'production',
  args: [] as unknown[],
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_ENV: f.environment, APP_URL: 'https://app.example.com' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: f.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: f.service }));
vi.mock('@bunshin/database', async (original) => {
  const actual = await original<typeof Database>();
  return {
    validateReproductionChallengeReviewAdminCommand:
      actual.validateReproductionChallengeReviewAdminCommand,
    prisma: {},
    PrismaReproductionChallengeReviewAdminRepository: class {
      constructor(
        _client: unknown,
        authority: unknown,
        commit: string,
        private guard: () => void,
      ) {
        f.args = [authority, commit];
      }
      async read(actor: string, reference: unknown) {
        this.guard();
        return (await f.read(actor, reference)) as unknown;
      }
      async change(actor: string, command: unknown) {
        this.guard();
        return (await f.change(actor, command)) as unknown;
      }
    },
  };
});
import { reproductionChallengeReviewResponse as response } from '../src/http/reproduction-challenge-review';
const id = '11111111-1111-4111-8111-111111111111';
const authority = {
  workspaceId: id,
  groupId: '22222222-2222-4222-8222-222222222222',
  serviceProgramId: '33333333-3333-4333-8333-333333333333',
};
const reference = REPRODUCTION_CHALLENGE_REVIEW_FIXTURES[0]!.reference;
const command = {
  operationId: id,
  reference,
  expectedRevision: 'a'.repeat(64),
  materialDigest: `sha256:${'b'.repeat(64)}`,
  reviewedCommitSha: 'c'.repeat(40),
  evidenceKey: 'synthetic-review',
  action: 'APPROVE',
  confirmation: 'CONFIRM_CHALLENGE_REVIEW',
  checklist: {
    objective: true,
    prerequisites: true,
    syntheticFacts: true,
    learnerTask: true,
    rubricAndMission: true,
    safety: true,
  },
};
const base = 'https://app.example.com/api/services/slug/ai-training/challenge-review';
const get = (query = `challengeKey=${reference.challengeKey}`) => new Request(`${base}?${query}`);
const post = (body: unknown = command, origin = 'https://app.example.com') =>
  new Request(base, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
describe('challenge review authenticated HTTP composition', () => {
  // Load the real public validator once before HTTP cases, not during a timed first request.
  beforeAll(async () => {
    await import('@bunshin/database');
  }, 60000);
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('external HTTP forbidden');
      }),
    );
    f.args = [];
    f.environment = 'production';
    f.actor.mockResolvedValue({ userId: id });
    f.service.mockResolvedValue({
      workspaceId: authority.workspaceId,
      serviceId: authority.groupId,
    });
    f.read.mockResolvedValue({
      executionPermission: 'NOT_GRANTED',
      recordedDecision: 'NOT_REVIEWED',
    });
    f.change.mockResolvedValue({ current: { executionPermission: 'NOT_GRANTED' } });
    vi.stubEnv('PERSONAL_LEARNING_CHALLENGE_REVIEW_ADMIN', 'true');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_PREPARATION', JSON.stringify(authority));
    vi.stubEnv('PERSONAL_LEARNING_PILOT', 'false');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT', 'false');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', command.reviewedCommitSha);
  });
  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it('GET derives only the pinned fixture, session actor and server authority/commit; no write', async () => {
    const result = await response(get(), 'slug');
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(f.read).toHaveBeenCalledWith(id, reference);
    expect(f.args).toEqual([authority, command.reviewedCommitSha]);
    expect(f.change).not.toHaveBeenCalled();
    expect((await result.json()).data.executionPermission).toBe('NOT_GRANTED');
  });
  it.each(['APPROVE', 'REJECT', 'REVISION_REQUIRED', 'REVOKE'])(
    'passes strict explicit %s to the existing repository',
    async (action) => {
      const input = {
        ...command,
        action,
        ...(action === 'REVOKE'
          ? { checklist: null, confirmation: 'CONFIRM_CHALLENGE_REVOKE' }
          : {}),
      };
      expect((await response(post(input), 'slug')).status).toBe(200);
      expect(f.change).toHaveBeenCalledWith(id, input);
    },
  );
  it('requires an authenticated session and same origin including missing origin', async () => {
    f.actor.mockResolvedValue(null);
    expect((await response(get(), 'slug')).status).toBe(401);
    f.actor.mockResolvedValue({ userId: id });
    expect((await response(post(command, 'https://foreign.example'), 'slug')).status).toBe(403);
    expect((await response(new Request(base, { method: 'POST', body: '{}' }), 'slug')).status).toBe(
      403,
    );
    expect(f.change).not.toHaveBeenCalled();
  });
  it.each(['PERSONAL_LEARNING_PILOT', 'PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT'])(
    'requires explicit OFF for %s',
    async (key) => {
      for (const value of ['true', '', 'unknown']) {
        vi.stubEnv(key, value);
        expect((await response(get(), 'slug')).status).toBe(404);
      }
      expect(f.read).not.toHaveBeenCalled();
    },
  );
  it('requires dedicated flag, complete authority and deployment SHA without fallback', async () => {
    for (const [key, value] of [
      ['PERSONAL_LEARNING_CHALLENGE_REVIEW_ADMIN', 'false'],
      ['VERCEL_GIT_COMMIT_SHA', ''],
      ['VERCEL_GIT_COMMIT_SHA', 'main'],
      ['PERSONAL_LEARNING_PRODUCTION_PREPARATION', '{}'],
    ]) {
      const previous = process.env[key!];
      vi.stubEnv(key!, value);
      expect((await response(get(), 'slug')).status).toBe(404);
      vi.stubEnv(key!, previous);
    }
    expect(f.read).not.toHaveBeenCalled();
  });
  it('denies wrong Service/Workspace and revoked management access', async () => {
    for (const value of [
      { workspaceId: id, serviceId: id },
      { workspaceId: authority.groupId, serviceId: authority.groupId },
    ]) {
      f.service.mockResolvedValue(value);
      expect((await response(get(), 'slug')).status).toBe(404);
    }
    f.service.mockRejectedValue(new ApplicationError('NOT_FOUND', 'service unavailable'));
    expect((await response(post(), 'slug')).status).toBe(404);
    f.service.mockRejectedValue(new Error('SERVICE_NOT_FOUND'));
    expect((await response(post(), 'slug')).status).toBe(404);
    f.service.mockRejectedValue(new Error('unknown DB failure'));
    expect((await response(post(), 'slug')).status).toBe(500);
    expect(f.change).not.toHaveBeenCalled();
  });
  it('rejects unknown/duplicate/extra query selectors', async () => {
    expect((await response(get('challengeKey=unknown'), 'slug')).status).toBe(404);
    for (const query of [
      '',
      `challengeKey=${reference.challengeKey}&challengeKey=unknown`,
      `challengeKey=${reference.challengeKey}&userId=${id}`,
      `challengeKey=${'x'.repeat(300)}`,
    ])
      expect((await response(get(query), 'slug')).status).toBe(400);
  });
  it('rejects extra actor/authority/body, implicit approval and invalid reference before writes', async () => {
    for (const input of [
      { ...command, userId: id },
      { ...command, authority },
      { ...command, material: 'secret' },
      { ...command, confirmation: 'automatic' },
      { ...command, checklist: { ...command.checklist, safety: false } },
      { ...command, reference: { ...reference, approved: true } },
    ])
      expect((await response(post(input), 'slug')).status).toBe(400);
    expect(f.change).not.toHaveBeenCalled();
  });
  it('bounds streamed request bytes and rejects malformed JSON/content type/query', async () => {
    expect(
      (await response(post({ ...command, evidenceKey: 'x'.repeat(5000) }), 'slug')).status,
    ).toBe(413);
    for (const request of [
      new Request(base, {
        method: 'POST',
        headers: { origin: 'https://app.example.com', 'content-type': 'application/json' },
        body: '{',
      }),
      new Request(base, {
        method: 'POST',
        headers: { origin: 'https://app.example.com' },
        body: '{}',
      }),
      new Request(`${base}?actor=x`, post()),
    ])
      expect((await response(request, 'slug')).status).toBe(400);
    expect(f.change).not.toHaveBeenCalled();
  });
  it.each([
    'PERSONAL_LEARNING_CHALLENGE_REVIEW_ADMIN',
    'PERSONAL_LEARNING_PRODUCTION_PREPARATION',
    'PERSONAL_LEARNING_PILOT',
    'PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT',
    'VERCEL_GIT_COMMIT_SHA',
  ])('rejects %s changed after Service resolution', async (key) => {
    f.service.mockImplementation(() => {
      vi.stubEnv(key, 'changed');
      return Promise.resolve({ workspaceId: id, serviceId: authority.groupId });
    });
    expect((await response(post(), 'slug')).status).toBe(404);
    expect(f.change).not.toHaveBeenCalled();
  });
  it('rechecks configuration before returning and preserves repository conflict/error mapping', async () => {
    f.read.mockImplementation(() => {
      vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'd'.repeat(40));
      return Promise.resolve({});
    });
    expect((await response(get(), 'slug')).status).toBe(404);
    f.change.mockRejectedValue(new ApplicationError('CONFLICT', 'reload'));
    expect((await response(post(), 'slug')).status).toBe(409);
    f.change.mockRejectedValue(new Error('private database detail'));
    const result = await response(post(), 'slug');
    expect(result.status).toBe(500);
    expect(await result.text()).not.toContain('private database detail');
  });
  it('rejects unsupported methods', async () => {
    const result = await response(new Request(base, { method: 'DELETE' }), 'slug');
    expect(result.status).toBe(405);
    expect(f.actor).not.toHaveBeenCalled();
  });
  it('rejects an unsupported application environment', async () => {
    f.environment = 'test';
    expect((await response(get(), 'slug')).status).toBe(404);
    expect(f.read).not.toHaveBeenCalled();
  });
  it('Next GET/POST route forwards the promised Service slug without changing the actor', async () => {
    const route =
      await import('../app/api/services/[serviceSlug]/ai-training/challenge-review/route');
    const context = { params: Promise.resolve({ serviceSlug: 'managed-service' }) };
    expect((await route.GET(get(), context)).status).toBe(200);
    expect((await route.POST(post(), context)).status).toBe(200);
    expect(f.service).toHaveBeenCalledWith('managed-service', id);
    expect(route.runtime).toBe('nodejs');
  });
});
