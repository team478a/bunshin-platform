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
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: f.actor }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: f.origin }));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: f.service }));
vi.mock('@bunshin/database', () => ({
  prisma: {
    serviceProgram: { findMany: f.findMany },
    $transaction: (work: (tx: unknown) => Promise<unknown>) =>
      work({
        $queryRaw: f.lockRows,
        serviceProgram: { findFirst: f.findOne, update: f.update },
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
