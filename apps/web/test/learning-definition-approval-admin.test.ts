import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const fake = vi.hoisted(() => ({
  actor: vi.fn(),
  origin: vi.fn(),
  service: vi.fn(),
  list: vi.fn(),
  change: vi.fn(),
  environment: vi.fn(),
  constructor: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: fake.environment }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: fake.actor }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: fake.origin }));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: fake.service }));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaLearningDefinitionApprovalAdminRepository: class {
    constructor(...args: unknown[]) {
      fake.constructor(...args);
    }
    list = fake.list;
    change = fake.change;
  },
}));
import { learningDefinitionApprovalAdminResponse } from '../src/http/learning-definition-approval-admin';
const command = {
  action: 'APPROVE',
  confirmation: 'CONFIRM_DEFINITION_APPROVAL',
  operationId: '11111111-1111-4111-8111-111111111111',
  definitionKey: 'PROMPT_STRUCTURE',
  version: 'AI_TRAINING_DEFINITION_FIXTURE_V1',
  expectedRevision: 'a'.repeat(64),
  reviewDigest: 'b'.repeat(64),
  reviewedCommitSha: 'c'.repeat(40),
  reviewEvidenceKey: 'review-123',
  reviewChecklist: {
    objective: true,
    prerequisites: true,
    concepts: true,
    safety: true,
    mistakes: true,
    practice: true,
    rubricAndMission: true,
  },
};
const req = (value: unknown = command) =>
  new Request('https://app.example.com/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
describe('Definition human approval HTTP', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('PERSONAL_LEARNING_DEFINITION_ADMIN', 'true');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_PREPARATION', '');
    vi.stubEnv('PERSONAL_LEARNING_PILOT', 'false');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT', 'false');
    fake.actor.mockResolvedValue({ userId: 'manager' });
    fake.environment.mockReturnValue({ APP_ENV: 'staging' });
    fake.service.mockResolvedValue({ workspaceId: 'server-workspace', serviceId: 'server-group' });
    fake.list.mockResolvedValue([]);
    fake.change.mockResolvedValue({ replayed: false });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('production uses only explicit server authority without manufacturing human review', async () => {
    const authority = {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      groupId: '22222222-2222-4222-8222-222222222222',
      serviceProgramId: '33333333-3333-4333-8333-333333333333',
    };
    fake.environment.mockReturnValue({ APP_ENV: 'production' });
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_PREPARATION', JSON.stringify(authority));
    fake.service.mockResolvedValue({
      workspaceId: authority.workspaceId,
      serviceId: authority.groupId,
    });
    expect(
      (
        await learningDefinitionApprovalAdminResponse(
          new Request('https://app.example.com/api'),
          'training',
        )
      ).status,
    ).toBe(200);
    expect(fake.change).not.toHaveBeenCalled();
    expect(fake.constructor).toHaveBeenCalledWith({}, undefined, authority);
    expect(
      (
        await learningDefinitionApprovalAdminResponse(
          req({ ...command, reviewChecklist: undefined }),
          'training',
        )
      ).status,
    ).toBe(400);
    expect(fake.change).not.toHaveBeenCalled();
    expect((await learningDefinitionApprovalAdminResponse(req(), 'training')).status).toBe(200);
    expect(fake.change).toHaveBeenCalledWith(
      { workspaceId: authority.workspaceId, groupId: authority.groupId, actorUserId: 'manager' },
      command,
    );
    fake.change.mockClear();
    fake.service.mockResolvedValue({
      workspaceId: authority.workspaceId,
      serviceId: authority.serviceProgramId,
    });
    expect((await learningDefinitionApprovalAdminResponse(req(), 'training')).status).toBe(404);
    expect(fake.change).not.toHaveBeenCalled();
  });
  it('revoking the preparation feature during service resolution prevents repository access', async () => {
    fake.service.mockImplementation(() => {
      vi.stubEnv('PERSONAL_LEARNING_DEFINITION_ADMIN', 'false');
      return Promise.resolve({ workspaceId: 'server-workspace', serviceId: 'server-group' });
    });
    expect((await learningDefinitionApprovalAdminResponse(req(), 'training')).status).toBe(404);
    expect(fake.constructor).not.toHaveBeenCalled();
  });
  it('GET never mutates; POST resolves Service and actor server-side', async () => {
    const get = await learningDefinitionApprovalAdminResponse(
      new Request('https://app.example.com/api'),
      'training',
    );
    expect(get.status).toBe(200);
    expect(get.headers.get('cache-control')).toBe('private, no-store');
    expect(fake.change).not.toHaveBeenCalled();
    expect((await learningDefinitionApprovalAdminResponse(req(), 'training')).status).toBe(200);
    expect(fake.origin).toHaveBeenCalledOnce();
    expect(fake.change).toHaveBeenCalledWith(
      { workspaceId: 'server-workspace', groupId: 'server-group', actorUserId: 'manager' },
      command,
    );
  });
  it.each(['production', 'flag-off'])(
    'keeps %s unavailable without a repository call',
    async (mode) => {
      if (mode === 'production') fake.environment.mockReturnValue({ APP_ENV: 'production' });
      else vi.stubEnv('PERSONAL_LEARNING_DEFINITION_ADMIN', 'false');
      expect((await learningDefinitionApprovalAdminResponse(req(), 'training')).status).toBe(404);
      expect(fake.change).not.toHaveBeenCalled();
    },
  );
  it('rejects missing session, foreign Service, Origin and current DB permission loss', async () => {
    fake.actor.mockResolvedValue(null);
    expect((await learningDefinitionApprovalAdminResponse(req(), 'training')).status).toBe(401);
    fake.actor.mockResolvedValue({ userId: 'manager' });
    fake.service.mockRejectedValue(new Error('SERVICE_NOT_FOUND'));
    expect((await learningDefinitionApprovalAdminResponse(req(), 'foreign')).status).toBe(404);
    fake.origin.mockImplementation(() => {
      throw new ApplicationError('FORBIDDEN', 'origin');
    });
    expect((await learningDefinitionApprovalAdminResponse(req(), 'training')).status).toBe(403);
    expect(fake.change).not.toHaveBeenCalled();
    fake.origin.mockImplementation(() => {});
    fake.service.mockResolvedValue({ workspaceId: 'w', serviceId: 'g' });
    fake.change.mockRejectedValue(new ApplicationError('FORBIDDEN', 'role revoked'));
    expect((await learningDefinitionApprovalAdminResponse(req(), 'training')).status).toBe(403);
  });
  it.each([
    { ...command, actorUserId: 'forged' },
    { ...command, workspaceId: 'forged' },
    { ...command, approvedAt: '2099-01-01' },
    { ...command, reviewChecklist: { ...command.reviewChecklist, safety: false } },
    { ...command, reviewChecklist: undefined },
    { ...command, confirmation: 'yes' },
    { ...command, reviewEvidenceKey: 'private business text' },
    { ...command, reviewDigest: 'bad' },
    { ...command, action: 'BULK' },
    { ...command, prompt: 'private' },
  ])('rejects extra, forged or unconfirmed inputs', async (body) => {
    expect((await learningDefinitionApprovalAdminResponse(req(body), 'training')).status).toBe(400);
    expect(fake.change).not.toHaveBeenCalled();
  });
  it('withdrawal is explicit; validation errors do not expose the submitted body', async () => {
    const { reviewChecklist, ...fields } = command;
    expect(reviewChecklist.safety).toBe(true);
    const body = { ...fields, action: 'DEPRECATE', confirmation: 'CONFIRM_DEFINITION_WITHDRAWAL' };
    expect((await learningDefinitionApprovalAdminResponse(req(body), 'training')).status).toBe(200);
    fake.change.mockRejectedValue(new ApplicationError('CONFLICT', 'changed'));
    expect((await learningDefinitionApprovalAdminResponse(req(body), 'training')).status).toBe(409);
    const bad = await learningDefinitionApprovalAdminResponse(
      req({ ...command, reviewEvidenceKey: 'private business text' }),
      'training',
    );
    expect(await bad.text()).not.toContain('private business text');
  });
  it('bounds bodies and rejects query scope injection and other methods', async () => {
    expect(
      (await learningDefinitionApprovalAdminResponse(req({ value: 'x'.repeat(5000) }), 'training'))
        .status,
    ).toBe(413);
    expect(
      (
        await learningDefinitionApprovalAdminResponse(
          new Request('https://app.example.com/api?workspaceId=foreign'),
          'training',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await learningDefinitionApprovalAdminResponse(
          new Request('https://app.example.com/api', { method: 'DELETE' }),
          'training',
        )
      ).status,
    ).toBe(405);
    expect(fake.change).not.toHaveBeenCalled();
  });
});
