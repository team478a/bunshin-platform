import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const f = vi.hoisted(() => ({ read: vi.fn(), constructor: vi.fn(), environment: 'production' }));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => ({ APP_ENV: f.environment }) }));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaPersonalLearningPilotProfileRepository: class {
    constructor(...args: unknown[]) {
      f.constructor(...args);
    }
    read = f.read;
  },
}));
import { readPersonalLearningProfilePreparation as read } from '../src/services/personal-learning-profile-preparation-page';
const id = '11111111-1111-4111-8111-111111111111';
const authority = {
  workspaceId: id,
  groupId: '22222222-2222-4222-8222-222222222222',
  serviceProgramId: '33333333-3333-4333-8333-333333333333',
};
const service = { workspaceId: id, serviceId: authority.groupId };
describe('read-only learner preparation page gate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    f.environment = 'production';
    vi.stubEnv('PERSONAL_LEARNING_PROFILE_PREPARATION', 'true');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_PREPARATION', JSON.stringify(authority));
    vi.stubEnv('PERSONAL_LEARNING_PILOT', 'false');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT', 'false');
    f.read.mockResolvedValue({ profile: null });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('uses trusted authority and actor scope without any write or execution call', async () => {
    expect(await read(service, id, id)).toBeNull();
    expect(f.constructor).toHaveBeenCalledWith({}, undefined, authority);
    expect(f.read).toHaveBeenCalledWith({
      workspaceId: id,
      groupId: authority.groupId,
      programEnrollmentId: id,
      actorUserId: id,
    });
    f.read.mockResolvedValue({
      profile: {
        id: 'private-id',
        updatedByUserId: id,
        role: 'OTHER',
        aiLevel: 'BEGINNER',
        dailyMinutes: 5,
      },
    });
    expect(await read(service, id, id)).toEqual({
      role: 'OTHER',
      aiLevel: 'BEGINNER',
      dailyMinutes: 5,
    });
  });
  it.each(['PERSONAL_LEARNING_PILOT', 'PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT'])(
    'refuses execution flag %s even in staging',
    async (flag) => {
      f.environment = 'staging';
      vi.stubEnv(flag, 'true');
      await expect(read(service, id, id)).rejects.toThrow();
      expect(f.read).not.toHaveBeenCalled();
    },
  );
  it('refuses missing authority, preparation off, unknown environment and foreign Service', async () => {
    await expect(read({ ...service, serviceId: id }, id, id)).rejects.toThrow();
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_PREPARATION', '');
    await expect(read(service, id, id)).rejects.toThrow();
    vi.stubEnv('PERSONAL_LEARNING_PROFILE_PREPARATION', 'false');
    await expect(read(service, id, id)).rejects.toThrow();
    f.environment = 'unknown';
    vi.stubEnv('PERSONAL_LEARNING_PROFILE_PREPARATION', 'true');
    await expect(read(service, id, id)).rejects.toThrow();
    expect(f.read).not.toHaveBeenCalled();
  });
  it('propagates live repository seat/ownership/deletion/period denial', async () => {
    f.read.mockRejectedValue(new ApplicationError('NOT_FOUND', 'unavailable'));
    await expect(read(service, id, id)).rejects.toThrow('unavailable');
  });
  it('rechecks preparation revocation after the database await', async () => {
    f.read.mockImplementation(() => {
      vi.stubEnv('PERSONAL_LEARNING_PROFILE_PREPARATION', 'false');
      return Promise.resolve({ profile: null });
    });
    await expect(read(service, id, id)).rejects.toThrow();
  });
});
