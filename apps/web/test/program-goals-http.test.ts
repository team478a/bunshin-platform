import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import { AI_TRAINING_V1_MODULE_KEY } from '@bunshin/capability-training';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  member: vi.fn(),
  manager: vi.fn(),
  public: vi.fn(),
  membership: vi.fn(),
  enrollment: vi.fn(),
  program: vi.fn(),
  policy: vi.fn(),
  policyUpdate: vi.fn(),
  aggregate: vi.fn(),
  policyCreate: vi.fn(),
  audit: vi.fn(),
  definition: vi.fn(),
  definitionCreate: vi.fn(),
  preference: vi.fn(),
  cancelGoals: vi.fn(),
  goalCreate: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
  period: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.com' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({
  resolveMemberServiceContext: m.member,
  resolveManagedServiceContext: m.manager,
  resolvePublicServiceContext: m.public,
}));
vi.mock('@bunshin/database', () => {
  const tx = {
    groupMembership: { findFirst: m.membership },
    programEnrollment: { findFirst: m.enrollment },
    serviceProgram: { findFirst: m.program },
    serviceProgramSupportPolicy: {
      findFirst: m.policy,
      update: m.policyUpdate,
      aggregate: m.aggregate,
      create: m.policyCreate,
    },
    programGoalDefinition: { findFirst: m.definition, create: m.definitionCreate },
    programMemberPreference: { upsert: m.preference },
    programMemberGoal: { updateMany: m.cancelGoals, create: m.goalCreate },
    programAuditLog: { create: m.audit },
  };
  return {
    prisma: {
      ...tx,
      $transaction: (callback: (value: typeof tx) => unknown) => {
        m.transaction();
        return callback(tx);
      },
    },
    lockTrainingEnrollmentData: m.lock,
    trainingEnrollmentPeriodWhere: m.period,
  };
});
import { programGoalsResponse } from '../src/http/program-goals';

const programId = '00000000-0000-4000-8000-000000000001';
const enrollmentId = '00000000-0000-4000-8000-000000000002';
const definitionId = '00000000-0000-4000-8000-000000000003';
const bodies = {
  SET_SUPPORT_POLICY: {
    action: 'SET_SUPPORT_POLICY',
    serviceProgramId: programId,
    allowedSupportModes: ['GUIDED'],
    defaultSupportMode: 'GUIDED',
    memberMayChoose: true,
    guidance: '案内',
  },
  CREATE_GOAL_DEFINITION: {
    action: 'CREATE_GOAL_DEFINITION',
    serviceProgramId: programId,
    name: '目標',
    description: '説明',
    metricType: 'ACTION',
    unit: '回',
    suggestedTarget: 3,
  },
  SAVE_PREFERENCE: {
    action: 'SAVE_PREFERENCE',
    programEnrollmentId: enrollmentId,
    preferredSupportMode: 'GUIDED',
    notes: '希望',
  },
  SET_MEMBER_GOAL: {
    action: 'SET_MEMBER_GOAL',
    programEnrollmentId: enrollmentId,
    goalDefinitionId: definitionId,
    title: '自分の目標',
    metricType: 'ACTION',
    targetValue: 3,
    unit: '回',
    dueAt: null,
  },
};
type Action = keyof typeof bodies;
const actions = Object.keys(bodies) as Action[];
const managers: Action[] = ['SET_SUPPORT_POLICY', 'CREATE_GOAL_DEFINITION'];
const members: Action[] = ['SAVE_PREFERENCE', 'SET_MEMBER_GOAL'];
const context = (workspaceId = 'workspace-a', serviceId = 'service-a') => ({
  workspaceId,
  serviceId,
  configuration: { visibility: 'PRIVATE' },
});
function request(body: unknown, origin = 'https://example.com') {
  return new Request('https://example.com/api/services/private-a/program-goals', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const writes = () => [
  m.policyUpdate,
  m.policyCreate,
  m.audit,
  m.definitionCreate,
  m.preference,
  m.cancelGoals,
  m.goalCreate,
];
const noWrites = () => writes().forEach((fn) => expect(fn).not.toHaveBeenCalled());

beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: 'user-a' });
  m.manager.mockResolvedValue(context());
  m.member.mockResolvedValue(context());
  m.public.mockRejectedValue(new Error('must not resolve public service'));
  m.membership.mockResolvedValue({ id: 'membership-a' });
  m.enrollment.mockResolvedValue({ id: enrollmentId, serviceProgramId: programId });
  m.program.mockResolvedValue({
    id: programId,
    settings: { moduleKey: AI_TRAINING_V1_MODULE_KEY },
  });
  m.policy.mockResolvedValue({
    id: 'policy-a',
    version: 2,
    memberMayChoose: true,
    allowedSupportModes: ['GUIDED'],
  });
  m.aggregate.mockResolvedValue({ _max: { version: 2 } });
  m.policyCreate.mockResolvedValue({ id: 'policy-new', version: 3 });
  m.definition.mockResolvedValue({ id: definitionId });
  m.definitionCreate.mockResolvedValue({ id: 'definition-new' });
  m.preference.mockResolvedValue({ id: 'preference-a' });
  m.goalCreate.mockResolvedValue({ id: 'goal-a' });
  m.period.mockImplementation((now: Date) => ({
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  }));
});

describe.each(actions)('program goals %s boundary', (action) => {
  it('uses only the corresponding authority after authentication, even for a private service', async () => {
    const response = await programGoalsResponse(
      request({
        ...bodies[action],
        workspaceId: 'forged',
        groupId: 'forged',
        actorUserId: 'forged',
      }),
      'private-a',
    );
    expect(response.status).toBe(action === 'SAVE_PREFERENCE' ? 200 : 201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const resolver = managers.includes(action) ? m.manager : m.member;
    expect(resolver).toHaveBeenCalledExactlyOnceWith('private-a', 'user-a');
    expect(m.actor.mock.invocationCallOrder[0]).toBeLessThan(resolver.mock.invocationCallOrder[0]!);
    expect(managers.includes(action) ? m.member : m.manager).not.toHaveBeenCalled();
    expect(m.public).not.toHaveBeenCalled();
    const writer = {
      SET_SUPPORT_POLICY: m.policyCreate,
      CREATE_GOAL_DEFINITION: m.definitionCreate,
      SAVE_PREFERENCE: m.preference,
      SET_MEMBER_GOAL: m.goalCreate,
    }[action];
    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining(
        action === 'SAVE_PREFERENCE'
          ? {
              create: expect.objectContaining({
                workspaceId: 'workspace-a',
                groupId: 'service-a',
                updatedByUserId: 'user-a',
              }),
            }
          : {
              data: expect.objectContaining({
                workspaceId: 'workspace-a',
                groupId: 'service-a',
                createdByUserId: 'user-a',
              }),
            },
      ),
    );
  });
  it('rejects anonymous access before service or DB access', async () => {
    m.actor.mockResolvedValue(null);
    expect((await programGoalsResponse(request(bodies[action]), 'private-a')).status).toBe(401);
    expect(m.member).not.toHaveBeenCalled();
    expect(m.manager).not.toHaveBeenCalled();
    noWrites();
  });
  it('rejects another origin before authentication', async () => {
    expect(
      (await programGoalsResponse(request(bodies[action], 'https://evil.com'), 'private-a')).status,
    ).toBe(403);
    expect(m.actor).not.toHaveBeenCalled();
    noWrites();
  });
  it('rejects malformed action schema with 400 before resolving a service', async () => {
    expect((await programGoalsResponse(request({ action }), 'private-a')).status).toBe(400);
    expect(m.member).not.toHaveBeenCalled();
    expect(m.manager).not.toHaveBeenCalled();
    noWrites();
  });
  it('does not fall back after authority denies access', async () => {
    const resolver = managers.includes(action) ? m.manager : m.member;
    resolver.mockRejectedValue(new ApplicationError('NOT_FOUND', 'unavailable'));
    const response = await programGoalsResponse(request(bodies[action]), 'private-a');
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(managers.includes(action) ? m.member : m.manager).not.toHaveBeenCalled();
    expect(m.membership).not.toHaveBeenCalled();
    expect(m.program).not.toHaveBeenCalled();
    noWrites();
  });
  it('keeps unknown authority failures as 500', async () => {
    (managers.includes(action) ? m.manager : m.member).mockRejectedValue(
      new Error('internal secret'),
    );
    const response = await programGoalsResponse(request(bodies[action]), 'private-a');
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('internal secret');
    noWrites();
  });
  it('uses the switched workspace, service and actor rather than the prior context', async () => {
    m.actor.mockResolvedValue({ userId: 'user-b' });
    m.member.mockResolvedValue(context('workspace-b', 'service-b'));
    m.manager.mockResolvedValue(context('workspace-b', 'service-b'));
    const response = await programGoalsResponse(request(bodies[action]), 'private-b');
    expect(response.status).toBe(action === 'SAVE_PREFERENCE' ? 200 : 201);
    expect(managers.includes(action) ? m.manager : m.member).toHaveBeenCalledWith(
      'private-b',
      'user-b',
    );
    expect(managers.includes(action) ? m.program : m.membership).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'workspace-b', groupId: 'service-b' }),
      }),
    );
  });
});

describe('manager policy and definition isolation', () => {
  it.each(managers)(
    'maps existing manager denial sentinel without participant fallback: %s',
    async (action) => {
      m.manager.mockRejectedValue(new Error('SERVICE_NOT_FOUND'));
      expect((await programGoalsResponse(request(bodies[action]), 'private-a')).status).toBe(404);
      expect(m.member).not.toHaveBeenCalled();
      noWrites();
    },
  );
  it.each(managers)('rejects an inactive or foreign program: %s', async (action) => {
    m.program.mockResolvedValue(null);
    expect((await programGoalsResponse(request(bodies[action]), 'private-a')).status).toBe(404);
    expect(m.program).toHaveBeenCalledWith({
      where: { id: programId, workspaceId: 'workspace-a', groupId: 'service-a', status: 'ACTIVE' },
      select: { id: true },
    });
    noWrites();
  });
  it('versions policy and audits only its managed service', async () => {
    expect(
      (await programGoalsResponse(request(bodies.SET_SUPPORT_POLICY), 'private-a')).status,
    ).toBe(201);
    expect(m.policyUpdate).toHaveBeenCalledWith({
      where: { id: 'policy-a' },
      data: { status: 'SUPERSEDED', supersededAt: expect.any(Date) },
    });
    expect(m.policyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ version: 3, serviceProgramId: programId }),
    });
    expect(m.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        performedByUserId: 'user-a',
        resourceId: 'policy-new',
        beforeData: { id: 'policy-a', version: 2 },
      }),
    });
  });
  it('rejects a default outside allowed support modes without superseding a policy', async () => {
    expect(
      (
        await programGoalsResponse(
          request({ ...bodies.SET_SUPPORT_POLICY, defaultSupportMode: 'IDEA_ONLY' }),
          'private-a',
        )
      ).status,
    ).toBe(400);
    expect(m.transaction).not.toHaveBeenCalled();
    noWrites();
  });
});

describe.each(members)('member enrollment %s isolation', (action) => {
  it('requires the actor membership within its service', async () => {
    m.membership.mockResolvedValue(null);
    expect((await programGoalsResponse(request(bodies[action]), 'private-a')).status).toBe(403);
    expect(m.membership).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        userId: 'user-a',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    expect(m.enrollment).not.toHaveBeenCalled();
    noWrites();
  });
  it('rejects a foreign, ended or missing enrollment', async () => {
    m.enrollment.mockResolvedValue(null);
    expect((await programGoalsResponse(request(bodies[action]), 'private-a')).status).toBe(404);
    expect(m.enrollment).toHaveBeenCalledWith({
      where: {
        id: enrollmentId,
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        groupMembershipId: 'membership-a',
        status: 'ACTIVE',
      },
    });
    expect(m.lock).not.toHaveBeenCalled();
    noWrites();
  });
  it('locks before rechecking training period and saving', async () => {
    expect((await programGoalsResponse(request(bodies[action]), 'private-a')).status).toBe(
      action === 'SAVE_PREFERENCE' ? 200 : 201,
    );
    expect(m.lock).toHaveBeenCalledWith(expect.any(Object), {
      workspaceId: 'workspace-a',
      groupId: 'service-a',
      programEnrollmentId: enrollmentId,
      actorUserId: 'user-a',
    });
    expect(m.enrollment).toHaveBeenLastCalledWith({
      where: {
        id: enrollmentId,
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        groupMembershipId: 'membership-a',
        status: 'ACTIVE',
        AND: [
          {
            startsAt: { lte: expect.any(Date) },
            OR: [{ endsAt: null }, { endsAt: { gt: expect.any(Date) } }],
          },
        ],
      },
      select: { id: true },
    });
    expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.period.mock.invocationCallOrder[0]!);
    expect(m.enrollment.mock.invocationCallOrder[1]).toBeLessThan(
      (action === 'SAVE_PREFERENCE' ? m.preference : m.cancelGoals).mock.invocationCallOrder[0]!,
    );
  });
  it.each(['before-start', 'expired', 'cancelled'])(
    'refuses a post-lock enrollment denial (%s) before writes',
    async () => {
      m.enrollment
        .mockResolvedValueOnce({ id: enrollmentId, serviceProgramId: programId })
        .mockResolvedValueOnce(null);
      expect((await programGoalsResponse(request(bodies[action]), 'private-a')).status).toBe(404);
      expect(m.lock).toHaveBeenCalled();
      noWrites();
    },
  );
  it('does not impose AI training period conditions on non-training programs', async () => {
    m.program.mockResolvedValue({ id: programId, settings: { moduleKey: 'OTHER' } });
    expect((await programGoalsResponse(request(bodies[action]), 'private-a')).status).toBe(
      action === 'SAVE_PREFERENCE' ? 200 : 201,
    );
    expect(m.period).not.toHaveBeenCalled();
    expect(m.enrollment.mock.calls[1]![0].where).not.toHaveProperty('AND');
  });
  it('does not save if the scoped program disappears after locking', async () => {
    m.program.mockResolvedValue(null);
    expect((await programGoalsResponse(request(bodies[action]), 'private-a')).status).toBe(404);
    noWrites();
  });
});

describe('member policy and goal validation', () => {
  it.each([
    null,
    { memberMayChoose: false, allowedSupportModes: ['GUIDED'] },
    { memberMayChoose: true, allowedSupportModes: ['IDEA_ONLY'] },
  ])('rejects unavailable member choice', async (policy) => {
    m.policy.mockResolvedValue(policy);
    expect((await programGoalsResponse(request(bodies.SAVE_PREFERENCE), 'private-a')).status).toBe(
      403,
    );
    noWrites();
  });
  it('checks the definition within the enrolled program', async () => {
    m.definition.mockResolvedValue(null);
    expect((await programGoalsResponse(request(bodies.SET_MEMBER_GOAL), 'private-a')).status).toBe(
      404,
    );
    expect(m.definition).toHaveBeenCalledWith({
      where: {
        id: definitionId,
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        serviceProgramId: programId,
        status: 'ACTIVE',
      },
    });
    noWrites();
  });
  it('preserves prior goals instead of overwriting them', async () => {
    expect((await programGoalsResponse(request(bodies.SET_MEMBER_GOAL), 'private-a')).status).toBe(
      201,
    );
    expect(m.cancelGoals).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-a',
        groupId: 'service-a',
        programEnrollmentId: enrollmentId,
        status: 'ACTIVE',
      },
      data: { status: 'CANCELLED', updatedByUserId: 'user-a' },
    });
    expect(m.goalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupMembershipId: 'membership-a',
        goalDefinitionId: definitionId,
      }),
    });
  });
  it('rejects past due dates before cancelling prior goals', async () => {
    expect(
      (
        await programGoalsResponse(
          request({ ...bodies.SET_MEMBER_GOAL, dueAt: '2020-01-01T00:00:00Z' }),
          'private-a',
        )
      ).status,
    ).toBe(400);
    noWrites();
  });
  it.each(['not-an-id', null, 42])('rejects invalid enrollment IDs: %s', async (id) => {
    expect(
      (
        await programGoalsResponse(
          request({ ...bodies.SAVE_PREFERENCE, programEnrollmentId: id }),
          'private-a',
        )
      ).status,
    ).toBe(400);
    noWrites();
  });
  it('rejects broken JSON as 400 before either resolver', async () => {
    const req = new Request('https://example.com/api/services/private-a/program-goals', {
      method: 'POST',
      headers: { origin: 'https://example.com', 'content-type': 'application/json' },
      body: '{',
    });
    expect((await programGoalsResponse(req, 'private-a')).status).toBe(400);
    expect(m.member).not.toHaveBeenCalled();
    expect(m.manager).not.toHaveBeenCalled();
    noWrites();
  });
  it('rejects non-JSON content before authentication', async () => {
    const req = new Request('https://example.com/api/services/private-a/program-goals', {
      method: 'POST',
      headers: { origin: 'https://example.com' },
      body: 'text',
    });
    expect((await programGoalsResponse(req, 'private-a')).status).toBe(400);
    expect(m.actor).not.toHaveBeenCalled();
    noWrites();
  });
});
