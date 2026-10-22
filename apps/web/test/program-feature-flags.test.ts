import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

const f = vi.hoisted(() => ({
  actor: vi.fn(),
  origin: vi.fn(),
  service: vi.fn(),
  findMany: vi.fn(),
  lockRows: vi.fn(),
  findOne: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
  enrollmentCount: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: f.actor }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: f.origin }));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: f.service }));
vi.mock('@bunshin/database', () => ({
  prisma: {
    serviceProgram: { findMany: f.findMany },
    programEnrollment: { count: f.enrollmentCount },
    $transaction: (work: (tx: unknown) => Promise<unknown>) =>
      work({
        $queryRaw: f.lockRows,
        serviceProgram: { findFirst: f.findOne, update: f.update },
        programEnrollment: { count: f.enrollmentCount },
        programAuditLog: { create: f.audit },
      }),
  },
}));

import { programFeatureFlagsResponse as response } from '../src/http/program-feature-flags';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const serviceId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const programId = '44444444-4444-4444-8444-444444444444';
const updatedAt = new Date('2026-10-19T00:00:00.000Z');
const oldFeatures = {
  conversation: false,
  multiTopic: false,
  lineLearning: false,
  extendedScope: false,
  learningNudges: false,
  toolUpdates: false,
};
const program = {
  id: programId,
  displayName: '研修Program A',
  status: 'SUSPENDED',
  updatedAt,
  settings: {
    moduleKey: 'AI_TRAINING_V1',
    personalLearningPilot: {
      enabled: false,
      learningMode: 'DYNAMIC_V1',
      learningFeatures: oldFeatures,
    },
  },
};
const command = {
  serviceProgramId: programId,
  expectedUpdatedAt: updatedAt.toISOString(),
  learningMode: 'DYNAMIC_V1',
  learningFeatures: { ...oldFeatures, conversation: true, learningNudges: true },
  reviewEvidenceKey: 'review-2026-10-19',
  confirmation: 'CONFIRM_PROGRAM_FEATURE_SETTINGS',
};
const post = (body: unknown) =>
  new Request('https://example.test/api/services/demo/manage/programs/feature-flags', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  f.actor.mockResolvedValue({ userId: actorId });
  f.origin.mockReturnValue(undefined);
  f.service.mockResolvedValue({ workspaceId, serviceId });
  f.findMany.mockResolvedValue([program]);
  f.lockRows.mockResolvedValue([{ id: programId }]);
  f.findOne.mockResolvedValue(program);
  f.update.mockImplementation(({ data }: { data: { settings: unknown } }) =>
    Promise.resolve({
      ...program,
      settings: data.settings,
      updatedAt: new Date('2026-10-19T00:01:00Z'),
    }),
  );
  f.audit.mockResolvedValue({ id: 'audit-id' });
  f.enrollmentCount.mockResolvedValue(0);
});
afterEach(() => vi.clearAllMocks());

describe('Program-scoped AI-training feature flags', () => {
  it('lists only this service workspace’s AI-training Programs with current values', async () => {
    const result = await response(
      new Request('https://example.test/api/services/demo/manage/programs/feature-flags'),
      'demo',
    );
    expect(result.status).toBe(200);
    expect(f.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId,
          groupId: serviceId,
          settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
        },
      }),
    );
    expect((await result.json()).data[0]).toMatchObject({
      id: programId,
      learningMode: 'DYNAMIC_V1',
      learningFeatures: oldFeatures,
      enabled: false,
      configurationValid: true,
      learningOfferPolicy: 'AI_SKILL_V1',
      hasEnrollments: false,
    });
  });

  it('updates only the selected suspended Program and leaves an audit record', async () => {
    const result = await response(post(command), 'demo');
    expect(result.status).toBe(200);
    expect(f.origin).toHaveBeenCalledOnce();
    expect(f.lockRows).toHaveBeenCalledOnce();
    const lockArgs = f.lockRows.mock.calls[0] as unknown[];
    expect(lockArgs.slice(1)).toEqual([programId, workspaceId, serviceId]);
    expect(f.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: programId },
        data: {
          settings: {
            moduleKey: 'AI_TRAINING_V1',
            personalLearningPilot: {
              enabled: false,
              learningMode: 'DYNAMIC_V1',
              learningFeatures: command.learningFeatures,
            },
          },
        },
      }),
    );
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId,
          groupId: serviceId,
          resourceId: programId,
          performedByUserId: actorId,
          action: 'LEARNING_FEATURES_UPDATED',
        }),
      }),
    );
    expect((await result.json()).data).toMatchObject({
      id: programId,
      learningFeatures: command.learningFeatures,
      status: 'SUSPENDED',
    });
  });

  it('writes SIDE_HUSTLE_V1 and audits the effective policy without changing other settings', async () => {
    const result = await response(
      post({ ...command, learningOfferPolicy: 'SIDE_HUSTLE_V1' }),
      'demo',
    );
    expect(result.status).toBe(200);
    expect(f.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settings: expect.objectContaining({
            learningOfferPolicy: 'SIDE_HUSTLE_V1',
            personalLearningPilot: expect.objectContaining({
              ...program.settings.personalLearningPilot,
              learningFeatures: command.learningFeatures,
            }),
          }),
        }),
      }),
    );
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          beforeData: expect.objectContaining({ learningOfferPolicy: 'AI_SKILL_V1' }),
          afterData: expect.objectContaining({ learningOfferPolicy: 'SIDE_HUSTLE_V1' }),
        }),
      }),
    );
    expect((await result.json()).data.learningOfferPolicy).toBe('SIDE_HUSTLE_V1');
  });

  it('deletes the explicit policy key when saving AI_SKILL_V1', async () => {
    const sideHustleProgram = {
      ...program,
      settings: { ...program.settings, learningOfferPolicy: 'SIDE_HUSTLE_V1' },
    };
    f.findOne.mockResolvedValue(sideHustleProgram);
    const result = await response(post({ ...command, learningOfferPolicy: 'AI_SKILL_V1' }), 'demo');
    expect(result.status).toBe(200);
    const updatedSettings = (
      f.update.mock.calls[0]?.[0] as { data: { settings: Record<string, unknown> } }
    ).data.settings;
    expect(updatedSettings).not.toHaveProperty('learningOfferPolicy');
  });

  it('rejects a policy change when any enrollment exists but allows a same-policy resubmit', async () => {
    f.enrollmentCount.mockResolvedValue(1);
    const changed = await response(
      post({ ...command, learningOfferPolicy: 'SIDE_HUSTLE_V1' }),
      'demo',
    );
    expect(changed.status).toBe(409);
    expect(f.update).not.toHaveBeenCalled();
    const unchanged = await response(
      post({ ...command, learningOfferPolicy: 'AI_SKILL_V1' }),
      'demo',
    );
    expect(unchanged.status).toBe(200);
  });

  it('rejects an unregistered policy in the request schema', async () => {
    const result = await response(
      post({ ...command, learningOfferPolicy: 'UNKNOWN_POLICY' }),
      'demo',
    );
    expect(result.status).toBe(400);
    expect(f.findOne).not.toHaveBeenCalled();
  });

  it('rejects a stale form without writing settings', async () => {
    f.findOne.mockResolvedValue({ ...program, updatedAt: new Date('2026-10-19T00:02:00Z') });
    const result = await response(post(command), 'demo');
    expect(result.status).toBe(409);
    expect(f.update).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });

  it('rejects active Programs and does not update them', async () => {
    f.findOne.mockResolvedValue({ ...program, status: 'ACTIVE' });
    const result = await response(post(command), 'demo');
    expect(result.status).toBe(409);
    expect(f.update).not.toHaveBeenCalled();
  });

  it('rejects Programs whose learning Pilot is enabled', async () => {
    f.findOne.mockResolvedValue({
      ...program,
      settings: {
        ...program.settings,
        personalLearningPilot: { ...program.settings.personalLearningPilot, enabled: true },
      },
    });
    const result = await response(
      post({ ...command, learningOfferPolicy: 'SIDE_HUSTLE_V1' }),
      'demo',
    );
    expect(result.status).toBe(409);
    expect(f.update).not.toHaveBeenCalled();
  });

  it('requires a service-admin session and a valid same-origin POST', async () => {
    f.actor.mockResolvedValue(null);
    expect((await response(post(command), 'demo')).status).toBe(401);
    f.actor.mockResolvedValue({ userId: actorId });
    f.origin.mockImplementation(() => {
      throw new ApplicationError('FORBIDDEN', 'origin rejected');
    });
    expect((await response(post(command), 'demo')).status).toBe(403);
    expect(f.findOne).not.toHaveBeenCalled();
  });
});
