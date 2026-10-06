import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({
  environment: 'development',
  service: vi.fn(),
  membership: vi.fn(),
  enrollment: vi.fn(),
  program: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => ({ APP_ENV: f.environment }) }));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: f.service }));
vi.mock('@bunshin/database', () => ({
  prisma: {
    groupMembership: { findFirst: f.membership },
    programEnrollment: { findFirst: f.enrollment },
    serviceProgram: { findFirst: f.program },
  },
  trainingEnrollmentPeriodWhere: () => ({ startsAt: { lte: new Date() } }),
}));
import {
  resolvePersonalLearningPilot,
  personalLearningPilotEnabled,
  personalLearningPilotExecutionAllowed,
  requirePersonalLearningPilotForReservedProgram,
} from '../src/services/personal-learning-pilot-access';
const enrollmentId = '00000000-0000-4000-8000-000000000003';
const settings = {
  moduleKey: 'AI_TRAINING_V1',
  personalLearningPilot: { enabled: true, enrollmentIds: [enrollmentId] },
  trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
};
describe('pilot server identity and exposure gate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    f.environment = 'development';
    vi.stubEnv('PERSONAL_LEARNING_PILOT', 'true');
    f.service.mockResolvedValue({ workspaceId: 'workspace', serviceId: 'service' });
    f.membership.mockResolvedValue({ id: 'member' });
    f.enrollment.mockResolvedValue({ serviceProgramId: 'program' });
    f.program.mockResolvedValue({ settings });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('derives scope from authenticated Service/membership, never client IDs', async () => {
    const result = await resolvePersonalLearningPilot('slug', enrollmentId, 'owner');
    expect(result.scope).toEqual({
      workspaceId: 'workspace',
      groupId: 'service',
      userId: 'owner',
      groupMembershipId: 'member',
      programEnrollmentId: enrollmentId,
    });
    expect(f.enrollment.mock.calls[0]?.[0].where).toMatchObject({
      workspaceId: 'workspace',
      groupId: 'service',
      groupMembershipId: 'member',
      status: 'ACTIVE',
    });
    expect(f.membership.mock.calls[0]?.[0].where).toMatchObject({
      userId: 'owner',
      serviceRole: 'PARTICIPANT',
      status: 'ACTIVE',
    });
  });
  it('cannot be enabled in production or by a missing flag', async () => {
    f.environment = 'production';
    expect(personalLearningPilotEnabled()).toBe(false);
    await expect(resolvePersonalLearningPilot('slug', enrollmentId, 'owner')).rejects.toThrow();
    f.environment = 'staging';
    vi.stubEnv('PERSONAL_LEARNING_PILOT', 'false');
    await expect(resolvePersonalLearningPilot('slug', enrollmentId, 'owner')).rejects.toThrow();
    expect(f.service).not.toHaveBeenCalled();
  });
  it('stops queued Pilot execution when disabled, while leaving ordinary V1 allowed', () => {
    expect(personalLearningPilotExecutionAllowed(settings, enrollmentId)).toBe(true);
    vi.stubEnv('PERSONAL_LEARNING_PILOT', 'false');
    expect(personalLearningPilotExecutionAllowed(settings, enrollmentId)).toBe(false);
    expect(
      personalLearningPilotExecutionAllowed({ moduleKey: 'AI_TRAINING_V1' }, enrollmentId),
    ).toBe(true);
    vi.stubEnv('PERSONAL_LEARNING_PILOT', 'true');
    f.environment = 'production';
    expect(personalLearningPilotExecutionAllowed(settings, enrollmentId)).toBe(false);
  });
  it('reserved legacy Answer/Assessment entry points also require the non-production Pilot flag', async () => {
    f.environment = 'production';
    await expect(
      requirePersonalLearningPilotForReservedProgram('slug', enrollmentId, 'owner', {
        workspaceId: 'workspace',
        serviceId: 'service',
      }),
    ).rejects.toThrow();
    f.program.mockResolvedValue({ settings: { moduleKey: 'AI_TRAINING_V1' } });
    await expect(
      requirePersonalLearningPilotForReservedProgram('slug', enrollmentId, 'owner', {
        workspaceId: 'workspace',
        serviceId: 'service',
      }),
    ).resolves.toBeUndefined();
  });
  it('rejects cross-user / enrollment / dedicated Program opt-out', async () => {
    f.membership.mockResolvedValue(null);
    await expect(resolvePersonalLearningPilot('slug', enrollmentId, 'other')).rejects.toThrow();
    f.membership.mockResolvedValue({ id: 'member' });
    f.enrollment.mockResolvedValue(null);
    await expect(resolvePersonalLearningPilot('slug', enrollmentId, 'owner')).rejects.toThrow();
    f.enrollment.mockResolvedValue({ serviceProgramId: 'program' });
    f.program.mockResolvedValue({ settings: { moduleKey: 'AI_TRAINING_V1' } });
    await expect(resolvePersonalLearningPilot('slug', enrollmentId, 'owner')).rejects.toThrow();
  });
});
