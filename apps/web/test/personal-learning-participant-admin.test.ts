import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const f = vi.hoisted(() => ({
  actor: vi.fn(),
  origin: vi.fn(),
  service: vi.fn(),
  read: vi.fn(),
  change: vi.fn(),
  ctor: vi.fn(),
  environment: 'production',
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => ({ APP_ENV: f.environment }) }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: f.actor }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: f.origin }));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: f.service }));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaPersonalLearningParticipantAdminRepository: class {
    constructor(...args: unknown[]) {
      f.ctor(...args);
    }
    read = f.read;
    change = f.change;
  },
}));
import { personalLearningParticipantAdminResponse as response } from '../src/http/personal-learning-participant-admin';
const id = '11111111-1111-4111-8111-111111111111';
const authority = {
  workspaceId: id,
  groupId: '22222222-2222-4222-8222-222222222222',
  serviceProgramId: '33333333-3333-4333-8333-333333333333',
};
const body = {
  operationId: id,
  expectedRevision: 0,
  confirmation: 'CONFIRM_PILOT_PARTICIPANT_OPERATION',
  reviewEvidenceKey: 'human-review-1',
  action: 'CONFIGURE',
  externalParticipantCap: 100,
  internalParticipantCap: 0,
  currentWave: 0,
};
const request = (value: unknown = body) =>
  new Request('https://app.example.com/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
describe('trusted participant operation HTTP', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    f.environment = 'production';
    f.actor.mockResolvedValue({ userId: id });
    f.service.mockResolvedValue({
      workspaceId: authority.workspaceId,
      serviceId: authority.groupId,
    });
    f.read.mockResolvedValue({ seats: [] });
    f.change.mockResolvedValue({ revision: 1 });
    vi.stubEnv('PERSONAL_LEARNING_PARTICIPANT_PREPARATION', 'true');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_PREPARATION', JSON.stringify(authority));
    vi.stubEnv('PERSONAL_LEARNING_PILOT', 'false');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT', 'false');
  });
  afterEach(() => vi.unstubAllEnvs());
  it('GET is read-only and POST uses server authority and human evidence', async () => {
    expect((await response(new Request('https://app.example.com/api'), 'slug')).status).toBe(200);
    expect(f.change).not.toHaveBeenCalled();
    expect((await response(request(), 'slug')).status).toBe(200);
    expect(f.ctor.mock.calls[0]?.[1]).toEqual(authority);
    expect(f.change).toHaveBeenCalledWith(id, body);
  });
  it.each([
    { ...body, externalParticipantCap: 101 },
    { ...body, externalParticipantCap: 500 },
    { ...body, internalParticipantCap: -1 },
    { ...body, currentWave: 5 },
    { ...body, reviewEvidenceKey: '' },
    { ...body, confirmation: 'automatic' },
    { ...body, userId: id },
  ])('rejects invalid/implicit client authority (%j)', async (b) => {
    expect((await response(request(b), 'slug')).status).toBe(400);
    expect(f.change).not.toHaveBeenCalled();
  });
  it('requires session / same origin', async () => {
    f.actor.mockResolvedValue(null);
    expect((await response(request(), 'slug')).status).toBe(401);
    f.origin.mockImplementation(() => {
      throw new ApplicationError('FORBIDDEN', 'origin');
    });
    expect((await response(request(), 'slug')).status).toBe(403);
  });
  it.each(['PERSONAL_LEARNING_PILOT', 'PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT'])(
    'runtime switch %s closes preparation',
    async (flag) => {
      vi.stubEnv(flag, 'true');
      expect((await response(request(), 'slug')).status).toBe(404);
      expect(f.change).not.toHaveBeenCalled();
    },
  );
  it('missing authority/flag and scope mismatch are denied', async () => {
    vi.stubEnv('PERSONAL_LEARNING_PARTICIPANT_PREPARATION', 'false');
    expect((await response(request(), 'slug')).status).toBe(404);
    vi.stubEnv('PERSONAL_LEARNING_PARTICIPANT_PREPARATION', 'true');
    f.service.mockResolvedValue({ workspaceId: id, serviceId: id });
    expect((await response(request(), 'slug')).status).toBe(404);
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_PREPARATION', '');
    expect((await response(request(), 'slug')).status).toBe(404);
  });
  it('rechecks switch revocation after async Service lookup', async () => {
    f.service.mockImplementation(() => {
      vi.stubEnv('PERSONAL_LEARNING_PARTICIPANT_PREPARATION', 'false');
      return Promise.resolve({ workspaceId: authority.workspaceId, serviceId: authority.groupId });
    });
    expect((await response(request(), 'slug')).status).toBe(404);
    expect(f.change).not.toHaveBeenCalled();
  });
  it('maps capacity error without technical text', async () => {
    f.change.mockRejectedValue(new ApplicationError('CONFLICT', 'WAVE_CAP_REACHED'));
    const result = await response(request(), 'slug');
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({
      error: { message: '現在、無料モニターの受付上限に達しています。' },
    });
  });
  it('bounds input and rejects query', async () => {
    expect(
      (await response(request({ ...body, reviewEvidenceKey: 'x'.repeat(3000) }), 'slug')).status,
    ).toBe(413);
    expect(
      (await response(new Request('https://app.example.com/api?user=other'), 'slug')).status,
    ).toBe(400);
  });
});
