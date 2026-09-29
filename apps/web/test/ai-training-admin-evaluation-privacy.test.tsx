import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  actor: vi.fn(),
  service: vi.fn(),
  metrics: vi.fn(),
  programs: vi.fn(),
  enrollments: vi.fn(),
  members: vi.fn(),
  profiles: vi.fn(),
  snapshots: vi.fn(),
  assignments: vi.fn(),
  answers: vi.fn(),
  toolkit: vi.fn(),
  events: vi.fn(),
  jobs: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: fake.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: fake.service }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  redirect: () => {
    throw new Error('LOGIN');
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@bunshin/database', () => ({
  listTrainingAdminEvaluationMetrics: fake.metrics,
  prisma: {
    serviceProgram: { findMany: fake.programs },
    programEnrollment: { findMany: fake.enrollments },
    groupMembership: { findMany: fake.members },
    trainingParticipantProfile: { findMany: fake.profiles },
    programProgressSnapshot: { findMany: fake.snapshots },
    programMissionAssignment: { findMany: fake.assignments },
    trainingMissionAnswer: { findMany: fake.answers },
    trainingToolkitItem: { findMany: fake.toolkit },
    programActionEvent: { findMany: fake.events },
    job: { findMany: fake.jobs },
  },
}));
import Page from '../app/s/[serviceSlug]/manage/training/page';

describe('admin evaluation privacy composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.actor.mockResolvedValue({ userId: 'manager' });
    fake.service.mockResolvedValue({ workspaceId: 'workspace', serviceId: 'service' });
    fake.programs.mockResolvedValue([{ id: 'program', displayName: 'Training', settings: {} }]);
    fake.enrollments.mockResolvedValue([
      {
        id: 'enrollment',
        serviceProgramId: 'program',
        groupMembershipId: 'member',
        status: 'ACTIVE',
        startsAt: new Date('2020-01-01'),
        updatedAt: new Date(),
        endsAt: null,
        trainingRetention: null,
      },
    ]);
    fake.members.mockResolvedValue([
      { id: 'member', user: { displayName: 'Participant', email: null } },
    ]);
    for (const read of [
      fake.profiles,
      fake.snapshots,
      fake.assignments,
      fake.answers,
      fake.toolkit,
      fake.events,
      fake.jobs,
    ])
      read.mockResolvedValue([]);
    fake.metrics.mockResolvedValue([
      {
        programEnrollmentId: 'enrollment',
        evaluation: { result: 'PASS', skills: { promptStructure: 75 } },
        evaluatedAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  });
  it('fetches only projected metrics and keeps the pass count', async () => {
    const result = await Page({ params: Promise.resolve({ serviceSlug: 'training' }) });
    expect(fake.metrics).toHaveBeenCalledWith({
      workspaceId: 'workspace',
      groupId: 'service',
      actorUserId: 'manager',
      enrollmentIds: ['enrollment'],
    });
    expect(fake.answers).toHaveBeenCalledOnce();
    expect(fake.answers).toHaveBeenCalledWith(
      expect.objectContaining({ select: { evaluationStatus: true } }),
    );
    expect(result.props.analytics.passedEvaluations).toBe(1);
    expect(result.props.dashboard.participants[0]?.weakArea).toBe('まだ記録がありません');
    expect(JSON.stringify(result.props.dashboard)).not.toContain('evaluation');
  });
  it('does not read evaluations when the actor has no service management rights', async () => {
    fake.service.mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ serviceSlug: 'training' }) })).rejects.toThrow(
      'NOT_FOUND',
    );
    expect(fake.metrics).not.toHaveBeenCalled();
    expect(fake.answers).not.toHaveBeenCalled();
  });
  it('passes the same server period projection to totals and lifecycle without changing CAS status or inventing an end', async () => {
    vi.useFakeTimers();
    const checkedAt = new Date('2026-09-29T01:00:00Z');
    vi.setSystemTime(checkedAt);
    try {
      fake.enrollments.mockResolvedValue([
        {
          id: 'enrollment',
          serviceProgramId: 'program',
          groupMembershipId: 'member',
          status: 'ACTIVE',
          startsAt: new Date('2020-01-01'),
          endsAt: checkedAt,
          updatedAt: checkedAt,
          trainingRetention: null,
        },
      ]);
      const result = await Page({ params: Promise.resolve({ serviceSlug: 'training' }) });
      expect(result.props.checkedAt).toEqual(checkedAt);
      expect(result.props.dashboard.totals).toMatchObject({
        active: 0,
        pendingExpiryUpdate: 1,
        continuationPercent: 0,
      });
      expect(result.props.lifecycleRows).toEqual([
        {
          enrollmentId: 'enrollment',
          status: 'ACTIVE',
          displayStatus: 'PERIOD_ENDED',
          startsAt: new Date('2020-01-01').toISOString(),
          endsAt: checkedAt.toISOString(),
          updatedAt: checkedAt.toISOString(),
          endedAt: null,
        },
      ]);
      expect(fake.enrollments).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ startsAt: true, endsAt: true }),
          where: expect.objectContaining({ workspaceId: 'workspace', groupId: 'service' }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
