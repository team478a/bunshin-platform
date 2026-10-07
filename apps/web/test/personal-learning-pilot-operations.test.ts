import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const f = vi.hoisted(() => ({
  actor: vi.fn(),
  origin: vi.fn(),
  service: vi.fn(),
  read: vi.fn(),
  change: vi.fn(),
  runtime: vi.fn(),
  environment: 'production',
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => ({ APP_ENV: f.environment }) }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: f.actor }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: f.origin }));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: f.service }));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  resolveOpenAiRuntimeConfiguration: f.runtime,
}));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaPersonalLearningPilotOperations: class {
    constructor(
      _client: unknown,
      _authority: unknown,
      private guard: (action: string) => void,
    ) {}
    read = f.read;
    change(actor: string, c: { action: string }) {
      this.guard(c.action);
      return f.change(actor, c) as unknown;
    }
  },
}));
import { personalLearningPilotOperationsResponse as response } from '../src/http/personal-learning-pilot-operations';
const id = '11111111-1111-4111-8111-111111111111';
const authority = {
  workspaceId: id,
  groupId: '22222222-2222-4222-8222-222222222222',
  serviceProgramId: '33333333-3333-4333-8333-333333333333',
};
const command = {
  action: 'STOP',
  operationId: id,
  expectedStateToken: 'a'.repeat(64),
  confirmation: 'CONFIRM_PILOT_OPERATION',
  reviewEvidenceKey: 'human-review',
};
const request = (body: unknown = command) =>
  new Request('https://app.example.com/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
describe('trusted Pilot operations HTTP', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    f.environment = 'production';
    f.actor.mockResolvedValue({ userId: id });
    f.service.mockResolvedValue({
      workspaceId: authority.workspaceId,
      serviceId: authority.groupId,
    });
    f.read.mockResolvedValue({ drainStatus: 'UNKNOWN' });
    f.change.mockResolvedValue({ enabled: false, drainStatus: 'UNKNOWN' });
    f.runtime.mockResolvedValue({ model: 'reviewed-model' });
    vi.stubEnv('PERSONAL_LEARNING_PILOT_OPERATIONS', 'true');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_PREPARATION', JSON.stringify(authority));
    for (const key of [
      'PERSONAL_LEARNING_PILOT',
      'PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT',
      'PERSONAL_LEARNING_DEFINITION_ADMIN',
      'PERSONAL_LEARNING_PROFILE_PREPARATION',
      'PERSONAL_LEARNING_PARTICIPANT_PREPARATION',
    ])
      vi.stubEnv(key, 'false');
    vi.stubEnv(
      'PERSONAL_LEARNING_CALL_ADMISSION',
      JSON.stringify({
        ...authority,
        model: 'reviewed-model',
        dailyAttemptLimit: 12,
        maxConcurrent: 1,
        maxRequestBytes: 16384,
        maxOutputTokens: 2048,
      }),
    );
    vi.stubEnv(
      'PERSONAL_LEARNING_AI_PRICING',
      JSON.stringify([
        {
          provider: 'OPENAI',
          model: 'reviewed-model',
          effectiveFrom: '2026-01-01T00:00:00Z',
          inputPriceMicrosPerMillion: 1,
          outputPriceMicrosPerMillion: 1,
          cachedInputPriceMicrosPerMillion: 1,
          currency: 'USD',
          pricingVersion: 'synthetic-test-only',
        },
      ]),
    );
  });
  afterEach(() => vi.unstubAllEnvs());
  it('GET has no mutations or runtime configuration access', async () => {
    expect((await response(new Request('https://app.example.com/api'), 'slug')).status).toBe(200);
    expect(f.change).not.toHaveBeenCalled();
    expect(f.runtime).not.toHaveBeenCalled();
  });
  it('STOP remains available while execution and preparation flags are ON', async () => {
    vi.stubEnv('PERSONAL_LEARNING_PILOT', 'true');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT', 'true');
    vi.stubEnv('PERSONAL_LEARNING_PROFILE_PREPARATION', 'true');
    expect((await response(request(), 'slug')).status).toBe(200);
    expect(f.runtime).not.toHaveBeenCalled();
  });
  it.each(['INITIALIZE', 'CREATE_PROGRAM', 'PREPARE_ENROLLMENT', 'START'])(
    'runtime enabled denies %s',
    async (action) => {
      vi.stubEnv('PERSONAL_LEARNING_PILOT', 'true');
      const c =
        action === 'PREPARE_ENROLLMENT'
          ? { ...command, action, groupMembershipId: id, programOfferingId: id }
          : { ...command, action };
      expect((await response(request(c), 'slug')).status).toBe(404);
      expect(f.change).not.toHaveBeenCalled();
    },
  );
  it('creates only through the reviewed operation without Provider configuration', async () => {
    expect((await response(request({ ...command, action: 'CREATE_PROGRAM' }), 'slug')).status).toBe(
      200,
    );
    expect(f.change).toHaveBeenCalledWith(id, { ...command, action: 'CREATE_PROGRAM' });
    expect(f.runtime).not.toHaveBeenCalled();
    expect(
      (await response(request({ ...command, action: 'CREATE_PROGRAM', settings: {} }), 'slug'))
        .status,
    ).toBe(400);
  });
  it('START requires closed preparation, model match and reviewed pricing', async () => {
    expect((await response(request({ ...command, action: 'START' }), 'slug')).status).toBe(200);
    vi.stubEnv('PERSONAL_LEARNING_AI_PRICING', '[]');
    expect((await response(request({ ...command, action: 'START' }), 'slug')).status).toBe(404);
    vi.stubEnv('PERSONAL_LEARNING_DEFINITION_ADMIN', 'true');
    expect((await response(request({ ...command, action: 'START' }), 'slug')).status).toBe(404);
  });
  it('requires session, current Service access and same origin', async () => {
    f.actor.mockResolvedValue(null);
    expect((await response(request(), 'slug')).status).toBe(401);
    f.actor.mockResolvedValue({ userId: id });
    f.service.mockResolvedValue({ workspaceId: id, serviceId: id });
    expect((await response(request(), 'slug')).status).toBe(404);
    f.origin.mockImplementation(() => {
      throw new ApplicationError('FORBIDDEN', 'origin');
    });
    expect((await response(request(), 'slug')).status).toBe(403);
  });
  it('rejects a runtime model mismatch without sending any Provider request', async () => {
    f.runtime.mockResolvedValue({ model: 'different-model' });
    expect((await response(request({ ...command, action: 'START' }), 'slug')).status).toBe(404);
    expect(f.change).not.toHaveBeenCalled();
  });
  it('STOP ignores changed runtime configuration but not operation authority', async () => {
    f.service.mockImplementation(() => {
      vi.stubEnv('PERSONAL_LEARNING_CALL_ADMISSION', 'missing');
      vi.stubEnv('PERSONAL_LEARNING_PILOT', 'true');
      return Promise.resolve({ workspaceId: authority.workspaceId, serviceId: authority.groupId });
    });
    expect((await response(request(), 'slug')).status).toBe(200);
    expect(f.runtime).not.toHaveBeenCalled();
  });
  it('rejects extra authority, implicit approval, query and oversized input', async () => {
    expect((await response(request({ ...command, userId: id }), 'slug')).status).toBe(400);
    expect(
      (await response(request({ ...command, confirmation: 'automatic' }), 'slug')).status,
    ).toBe(400);
    expect(
      (await response(new Request('https://app.example.com/api?user=other'), 'slug')).status,
    ).toBe(400);
    expect(
      (await response(request({ ...command, reviewEvidenceKey: 'x'.repeat(3000) }), 'slug')).status,
    ).toBe(413);
  });
  it('operation authority/flag revocation after lookup is denied', async () => {
    f.service.mockImplementation(() => {
      vi.stubEnv('PERSONAL_LEARNING_PILOT_OPERATIONS', 'false');
      return Promise.resolve({ workspaceId: authority.workspaceId, serviceId: authority.groupId });
    });
    expect((await response(request(), 'slug')).status).toBe(404);
    expect(f.change).not.toHaveBeenCalled();
  });
});
