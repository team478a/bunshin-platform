import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const f = vi.hoisted(() => ({
  actor: vi.fn(),
  service: vi.fn(),
  read: vi.fn(),
  participants: vi.fn(),
  member: vi.fn(),
  enrollment: vi.fn(),
  offerings: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => ({ APP_ENV: 'production' }) }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => ({ getCurrentUser: f.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: f.service }));
vi.mock('@bunshin/database', () => ({
  prisma: {
    groupMembership: { findFirst: f.member },
    programEnrollment: { findFirst: f.enrollment },
    programOffering: { findMany: f.offerings },
  },
  PrismaPersonalLearningPilotOperations: class {
    read = f.read;
  },
  PrismaPersonalLearningParticipantAdminRepository: class {
    read = f.participants;
  },
}));
import { personalLearningInternalPreparationResponse as response } from '../src/http/personal-learning-internal-preparation';
const actor = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const offering = '44444444-4444-4444-8444-444444444444';
const enrollment = '55555555-5555-4555-8555-555555555555';
const authority = {
  workspaceId: actor,
  groupId: member,
  serviceProgramId: '33333333-3333-4333-8333-333333333333',
};
const req = () => new Request('https://example.test/api');
beforeEach(() => {
  vi.resetAllMocks();
  f.actor.mockResolvedValue({ userId: actor });
  f.service.mockResolvedValue({ workspaceId: authority.workspaceId, serviceId: authority.groupId });
  f.read.mockResolvedValue({
    exists: true,
    status: 'SUSPENDED',
    enabled: false,
    stateToken: 'a'.repeat(64),
  });
  f.participants.mockResolvedValue({
    policy: null,
    seats: [
      {
        programEnrollmentId: 'foreign',
        kind: 'INTERNAL',
        cohort: 'INTERNAL',
        admittedAt: 'private',
      },
    ],
  });
  f.member.mockResolvedValue({ id: member });
  f.enrollment.mockResolvedValue(null);
  f.offerings.mockResolvedValue([
    {
      id: offering,
      startsAt: null,
      endsAt: null,
      termsSnapshot: { participation: 'INVITATION_ONLY', supportModes: ['GUIDED'] },
    },
  ]);
  for (const key of [
    'PERSONAL_LEARNING_PILOT_OPERATIONS',
    'PERSONAL_LEARNING_PARTICIPANT_PREPARATION',
  ])
    vi.stubEnv(key, 'true');
  for (const key of ['PERSONAL_LEARNING_PILOT', 'PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT'])
    vi.stubEnv(key, 'false');
  vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_PREPARATION', JSON.stringify(authority));
});
afterEach(() => vi.unstubAllEnvs());
describe('own internal preparation read projection', () => {
  it('returns only own IDs, not other participants or personal data, with no write method', async () => {
    const result = await response(req(), 'test');
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    const data = (await result.json()).data;
    expect(data.groupMembershipId).toBe(member);
    expect(data.programOfferingId).toBe(offering);
    expect(JSON.stringify(data)).not.toContain('foreign');
    expect(JSON.stringify(data)).not.toContain('private');
    expect(f.member).toHaveBeenCalledWith({
      where: {
        workspaceId: actor,
        groupId: member,
        userId: actor,
        status: 'ACTIVE',
        serviceRole: 'SERVICE_OWNER',
      },
      select: { id: true },
    });
    expect(f.enrollment.mock.calls[0]![0].where).toEqual({
      ...authority,
      groupMembershipId: member,
    });
    expect(f.offerings.mock.calls[0]![0].where).toMatchObject(authority);
  });
  it('rejects anonymous, foreign Service and nonowner without exposing target refs', async () => {
    f.actor.mockResolvedValue(null);
    expect((await response(req(), 'test')).status).toBe(401);
    expect(f.read).not.toHaveBeenCalled();
    f.actor.mockResolvedValue({ userId: actor });
    f.service.mockResolvedValue({ workspaceId: member, serviceId: member });
    expect((await response(req(), 'foreign')).status).toBe(404);
    expect(f.read).not.toHaveBeenCalled();
    f.service.mockResolvedValue({ workspaceId: actor, serviceId: member });
    f.member.mockResolvedValue(null);
    expect((await response(req(), 'test')).status).toBe(404);
    expect(f.enrollment).not.toHaveBeenCalled();
  });
  it.each(['PERSONAL_LEARNING_PILOT', 'PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT'])(
    'closes with %s ON',
    async (flag) => {
      vi.stubEnv(flag, 'true');
      expect((await response(req(), 'test')).status).toBe(404);
      expect(f.read).not.toHaveBeenCalled();
    },
  );
  it.each(['PERSONAL_LEARNING_PILOT_OPERATIONS', 'PERSONAL_LEARNING_PARTICIPANT_PREPARATION'])(
    'requires %s',
    async (flag) => {
      vi.stubEnv(flag, 'false');
      expect((await response(req(), 'test')).status).toBe(404);
    },
  );
  it('rejects query-supplied identity and POST before accessing data', async () => {
    expect(
      (await response(new Request('https://example.test/api?userId=foreign'), 'test')).status,
    ).toBe(400);
    expect(
      (await response(new Request('https://example.test/api', { method: 'POST' }), 'test')).status,
    ).toBe(405);
    expect(f.read).not.toHaveBeenCalled();
  });
  it('honors existing stopped repository gate and rechecks after async reads', async () => {
    f.participants.mockRejectedValueOnce(new ApplicationError('NOT_FOUND', 'stopped required'));
    expect((await response(req(), 'test')).status).toBe(404);
    expect(f.member).not.toHaveBeenCalled();
    f.offerings.mockImplementationOnce(() => {
      vi.stubEnv('PERSONAL_LEARNING_PILOT', 'true');
      return [];
    });
    expect((await response(req(), 'test')).status).toBe(404);
  });
  it('requires an unambiguous eligible offering; no arbitrary first/latest choice', async () => {
    f.offerings.mockResolvedValueOnce([{ id: offering, termsSnapshot: {} }]);
    expect((await (await response(req(), 'test')).json()).data.programOfferingId).toBeNull();
    const valid = {
      id: offering,
      termsSnapshot: { participation: 'INVITATION_ONLY', supportModes: ['GUIDED'] },
    };
    f.offerings.mockResolvedValueOnce([valid, { ...valid, id: enrollment }]);
    expect((await (await response(req(), 'test')).json()).data.programOfferingId).toBeNull();
  });
  it('restores own enrollment/seat, but preserves inactive/revoked state', async () => {
    f.enrollment.mockResolvedValue({
      id: enrollment,
      status: 'ACTIVE',
      supportMode: 'GUIDED',
      endsAt: null,
    });
    f.participants.mockResolvedValue({
      policy: null,
      seats: [
        { programEnrollmentId: enrollment, kind: 'INTERNAL', cohort: 'INTERNAL', revokedAt: null },
      ],
    });
    expect((await (await response(req(), 'test')).json()).data).toMatchObject({
      enrollmentReady: true,
      seatStatus: 'INTERNAL',
    });
    f.enrollment.mockResolvedValue({
      id: enrollment,
      status: 'CANCELLED',
      supportMode: 'GUIDED',
      endsAt: null,
    });
    f.participants.mockResolvedValue({
      policy: null,
      seats: [
        {
          programEnrollmentId: enrollment,
          kind: 'INTERNAL',
          cohort: 'INTERNAL',
          revokedAt: new Date(),
        },
      ],
    });
    expect((await (await response(req(), 'test')).json()).data).toMatchObject({
      enrollmentReady: false,
      seatStatus: 'REVOKED',
    });
  });
});
