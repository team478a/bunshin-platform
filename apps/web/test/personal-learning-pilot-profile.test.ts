import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const fake = vi.hoisted(() => ({
  actor: vi.fn(),
  origin: vi.fn(),
  service: vi.fn(),
  read: vi.fn(),
  initialize: vi.fn(),
  environment: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: fake.environment }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: fake.actor }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: fake.origin }));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: fake.service }));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaPersonalLearningPilotProfileRepository: class {
    read = fake.read;
    initialize = fake.initialize;
  },
}));
import { personalLearningPilotProfileResponse } from '../src/http/personal-learning-pilot-profile';
const id = '11111111-1111-4111-8111-111111111111';
const body = {
  operationId: id,
  role: 'OTHER',
  aiLevel: 'INTERMEDIATE',
  dailyMinutes: 10,
  confirmation: 'CONFIRM_MY_LEARNING_PROFILE',
  expectedAbsent: true,
};
const req = (value: unknown = body) =>
  new Request('https://app.example.com/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
describe('Pilot learner-owned profile preparation HTTP', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('PERSONAL_LEARNING_PROFILE_PREPARATION', 'true');
    fake.environment.mockReturnValue({ APP_ENV: 'staging' });
    fake.actor.mockResolvedValue({ userId: 'learner' });
    fake.service.mockResolvedValue({ workspaceId: 'server-workspace', serviceId: 'server-group' });
    fake.read.mockResolvedValue({ profile: null });
    fake.initialize.mockResolvedValue({ outcome: 'INITIALIZED' });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('reads without initialization and resolves owner/service server-side', async () => {
    const get = await personalLearningPilotProfileResponse(
      new Request('https://app.example.com/api'),
      'training',
      id,
    );
    expect(get.status).toBe(200);
    expect(get.headers.get('cache-control')).toBe('private, no-store');
    expect(fake.initialize).not.toHaveBeenCalled();
    expect((await personalLearningPilotProfileResponse(req(), 'training', id)).status).toBe(200);
    expect(fake.initialize).toHaveBeenCalledWith(
      {
        workspaceId: 'server-workspace',
        groupId: 'server-group',
        programEnrollmentId: id,
        actorUserId: 'learner',
      },
      body,
    );
    expect(fake.origin).toHaveBeenCalledOnce();
  });
  it.each(['production', 'flag-off'])('keeps %s unavailable', async (mode) => {
    if (mode === 'production') fake.environment.mockReturnValue({ APP_ENV: 'production' });
    else vi.stubEnv('PERSONAL_LEARNING_PROFILE_PREPARATION', 'false');
    expect((await personalLearningPilotProfileResponse(req(), 'training', id)).status).toBe(404);
    expect(fake.initialize).not.toHaveBeenCalled();
  });
  it('rejects anonymous, foreign service, Origin and foreign Enrollment', async () => {
    fake.actor.mockResolvedValue(null);
    expect((await personalLearningPilotProfileResponse(req(), 'training', id)).status).toBe(401);
    fake.actor.mockResolvedValue({ userId: 'learner' });
    fake.service.mockRejectedValue(new Error('SERVICE_NOT_FOUND'));
    expect((await personalLearningPilotProfileResponse(req(), 'foreign', id)).status).toBe(404);
    fake.origin.mockImplementation(() => {
      throw new ApplicationError('FORBIDDEN', 'origin');
    });
    expect((await personalLearningPilotProfileResponse(req(), 'training', id)).status).toBe(403);
    expect(fake.initialize).not.toHaveBeenCalled();
    fake.origin.mockImplementation(() => {});
    fake.service.mockResolvedValue({ workspaceId: 'w', serviceId: 'g' });
    fake.initialize.mockRejectedValue(new ApplicationError('NOT_FOUND', 'owner mismatch'));
    expect((await personalLearningPilotProfileResponse(req(), 'training', id)).status).toBe(404);
  });
  it.each([
    { ...body, userId: 'someone-else' },
    { ...body, workspaceId: 'other' },
    { ...body, groupMembershipId: 'other' },
    { ...body, aiLevel: 'UNKNOWN' },
    { ...body, aiLevel: undefined },
    { ...body, role: undefined },
    { ...body, dailyMinutes: undefined },
    { ...body, confirmation: 'yes' },
    { ...body, expectedAbsent: false },
    { ...body, learningGoalKey: 'PROMPT_BASIC' },
    { ...body, skillScores: { promptStructure: 100 } },
    { ...body, businessContext: 'private company text' },
  ])('rejects missing answers, impersonation, defaults and goal/skill injection', async (value) => {
    const response = await personalLearningPilotProfileResponse(req(value), 'training', id);
    expect(response.status).toBe(400);
    expect(fake.initialize).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain('private company text');
  });
  it('limits bytes, query scope and malformed enrollment; maps conflicts', async () => {
    expect(
      (await personalLearningPilotProfileResponse(req({ value: 'x'.repeat(3000) }), 'training', id))
        .status,
    ).toBe(413);
    expect(
      (
        await personalLearningPilotProfileResponse(
          new Request('https://app.example.com/api?userId=other'),
          'training',
          id,
        )
      ).status,
    ).toBe(400);
    expect((await personalLearningPilotProfileResponse(req(), 'training', 'bad')).status).toBe(400);
    fake.initialize.mockRejectedValue(new ApplicationError('CONFLICT', 'already initialized'));
    expect((await personalLearningPilotProfileResponse(req(), 'training', id)).status).toBe(409);
  });
});
