import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ admit: vi.fn(), settle: vi.fn(), enabled: true }));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => ({ APP_ENV: 'staging' }) }));
vi.mock('../src/services/personal-learning-pilot-access', () => ({
  personalLearningPilotEnabled: () => fake.enabled,
}));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaPersonalLearningCallAdmission: class {
    admit = fake.admit;
    settle = fake.settle;
  },
}));
import { admitPersonalLearningCall } from '../src/services/personal-learning-call-admission';
const policy = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  groupId: '00000000-0000-4000-8000-000000000002',
  serviceProgramId: '00000000-0000-4000-8000-000000000003',
  model: 'synthetic',
  dailyAttemptLimit: 2,
  maxConcurrent: 1,
  maxRequestBytes: 10000,
  maxOutputTokens: 100,
};
const input = {
  actor: {
    actorUserId: 'user',
    scope: {
      workspaceId: policy.workspaceId,
      groupId: policy.groupId,
      programEnrollmentId: 'enrollment',
      groupMembershipId: 'membership',
      userId: 'user',
    },
  },
  assignmentId: 'assignment',
  answerId: 'answer',
  jobId: 'job',
  attemptCount: 1,
  model: 'synthetic',
};
describe('server Pilot call admission', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fake.enabled = true;
    fake.admit.mockResolvedValue({ id: 'permit' });
    vi.stubEnv('PERSONAL_LEARNING_CALL_ADMISSION', JSON.stringify(policy));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  it.each(['', 'null', '{}', '{bad'])(
    'missing or invalid policy stops without a repository call',
    async (value) => {
      vi.stubEnv('PERSONAL_LEARNING_CALL_ADMISSION', value);
      await expect(admitPersonalLearningCall(input)).rejects.toMatchObject({ retryable: false });
      expect(fake.admit).not.toHaveBeenCalled();
    },
  );
  it('switch off and model changes fail closed', async () => {
    fake.enabled = false;
    await expect(admitPersonalLearningCall(input)).rejects.toMatchObject({ retryable: false });
    fake.enabled = true;
    await expect(admitPersonalLearningCall({ ...input, model: 'other' })).rejects.toMatchObject({
      retryable: false,
    });
    expect(fake.admit).not.toHaveBeenCalled();
  });
  it('database errors fail closed and do not expose raw errors', async () => {
    fake.admit.mockRejectedValue(new Error('private error'));
    await expect(admitPersonalLearningCall(input)).rejects.toMatchObject({
      category: 'PERSONAL_LEARNING_CALL_ADMISSION_DENIED',
      retryable: false,
    });
  });
  it('uses the server environment and does not refund the daily attempt on settlement', async () => {
    const permit = await admitPersonalLearningCall(input);
    expect(fake.admit).toHaveBeenCalledWith({ ...input, policy, environment: 'STAGING' });
    expect(permit.requestLimits).toEqual({ maxRequestBytes: 10000, maxOutputTokens: 100 });
    await permit.settle();
    expect(fake.settle).toHaveBeenCalledWith({ id: 'permit' });
  });
  it('failed settlement logs a fixed code, retains the slot and never resends', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    fake.settle.mockRejectedValue(new Error('private error'));
    await (await admitPersonalLearningCall(input)).settle();
    expect(log).toHaveBeenCalledWith('PERSONAL_LEARNING_CALL_SETTLEMENT_FAILED');
    expect(fake.admit).toHaveBeenCalledOnce();
  });
});
