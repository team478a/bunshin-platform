import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaPersonalLearningAiCallRepository } from '../src';
const actor = {
  actorUserId: 'user',
  scope: {
    workspaceId: 'workspace',
    groupId: 'group',
    programEnrollmentId: 'enrollment',
    groupMembershipId: 'member',
    userId: 'user',
  },
};
const definition = {
  packageKey: 'AI_TRAINING',
  definitionKey: 'PROMPT_STRUCTURE',
  version: 'fixture',
};
const answerId = '00000000-0000-4000-8000-000000000001';
const input = {
  actor,
  assignmentId: 'assignment',
  answerId,
  usageKey: `training-evaluation:${answerId}:00000000-0000-4000-8000-000000000002:attempt:1`,
  measurement: {
    provider: 'openai',
    model: 'synthetic',
    inputTokens: null,
    outputTokens: null,
    cachedInputTokens: null,
    latencyMs: 100,
    success: false,
    errorCategory: 'TIMEOUT' as const,
    validationResult: 'NOT_RUN' as const,
    fallbackUsed: false,
    occurredAt: '2026-10-06T00:00:00Z',
  },
  registry: [],
};
function fixture() {
  const tx = {
    serviceProgram: {
      findFirst: vi.fn().mockResolvedValue({ settings: { personalLearningPilot: {} } }),
    },
    $queryRaw: vi.fn(),
    groupMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: 'member', serviceRole: 'PARTICIPANT' }),
    },
    programEnrollment: {
      findFirst: vi.fn().mockResolvedValue({
        serviceProgramId: 'program',
        serviceProgram: {
          workspaceId: 'workspace',
          groupId: 'group',
          settings: { personalLearningPilot: {} },
        },
      }),
    },
    programAuditLog: { findFirst: vi.fn().mockResolvedValue(null) },
    trainingMissionAnswer: { findFirst: vi.fn().mockResolvedValue({ id: answerId }) },
    programMissionAssignment: {
      findFirst: vi.fn().mockResolvedValue({
        targetResourceId: 'plan',
        displaySnapshot: { personalLearning: { planRevision: 1, definition } },
      }),
    },
    personalLearningPlanRevision: {
      findFirst: vi.fn().mockResolvedValue({ steps: [{ definition }] }),
    },
    programActionEvent: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
  };
  const db = {
    $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaClient;
  return { tx, repo: new PrismaPersonalLearningAiCallRepository(db) };
}
describe('Personal Learning AI call facts', () => {
  it('persists fixed fields and scope/version references without body data', async () => {
    const f = fixture();
    await f.repo.record(input);
    const data = f.tx.programActionEvent.create.mock.calls[0]![0].data;
    expect(data.metadata).toMatchObject({
      taskType: 'ASSESSMENT',
      planRevision: 1,
      definition,
      cost: { costStatus: 'UNKNOWN' },
    });
    expect(f.tx.trainingMissionAnswer.findFirst.mock.calls[0]![0]).toMatchObject({
      where: {
        userId: 'user',
        workspaceId: 'workspace',
        groupId: 'group',
        missionAssignmentId: 'assignment',
        programEnrollmentId: 'enrollment',
      },
      select: { id: true },
    });
    expect(JSON.stringify(data)).not.toContain('promptVersion');
  });
  it('replay is immutable; collision with another enrollment is refused', async () => {
    const f = fixture();
    f.tx.programActionEvent.findUnique.mockResolvedValue({
      programEnrollmentId: 'enrollment',
      actorUserId: 'user',
      missionAssignmentId: 'assignment',
      sourceResourceId: answerId,
      eventType: 'PERSONAL_LEARNING_AI_CALL',
    });
    await f.repo.record(input);
    expect(f.tx.programActionEvent.create).not.toHaveBeenCalled();
    f.tx.programActionEvent.findUnique.mockResolvedValue({ programEnrollmentId: 'other' });
    await expect(f.repo.record(input)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it.each(['member', 'enrollment', 'answer', 'plan', 'deletion'])(
    'rejects a missing/mismatched %s',
    async (kind) => {
      const f = fixture();
      if (kind === 'member') f.tx.groupMembership.findFirst.mockResolvedValue(null);
      if (kind === 'enrollment') f.tx.programEnrollment.findFirst.mockResolvedValue(null);
      if (kind === 'answer') f.tx.trainingMissionAnswer.findFirst.mockResolvedValue(null);
      if (kind === 'plan') f.tx.personalLearningPlanRevision.findFirst.mockResolvedValue(null);
      if (kind === 'deletion') f.tx.programAuditLog.findFirst.mockResolvedValue({ id: 'deleted' });
      await expect(f.repo.record(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(f.tx.programActionEvent.create).not.toHaveBeenCalled();
    },
  );
  it('rejects a different actor and arbitrary attempt key/body fields', async () => {
    const f = fixture();
    await expect(
      f.repo.record({ ...input, actor: { ...actor, actorUserId: 'other' } }),
    ).rejects.toThrow();
    await expect(f.repo.record({ ...input, usageKey: 'private text' })).rejects.toThrow();
    await expect(
      f.repo.record({
        ...input,
        measurement: { ...input.measurement, prompt: 'private' } as typeof input.measurement,
      }),
    ).rejects.toThrow();
  });
});
