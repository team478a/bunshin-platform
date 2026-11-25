import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportObservedModelJob } from '../src/observed-model-report';

const tx = vi.hoisted(() => ({
  job: { findFirst: vi.fn() },
  aiUsageEvent: { findMany: vi.fn() },
  aiProviderCallAdmission: { findMany: vi.fn() },
}));
vi.mock('@bunshin/database', () => ({
  prisma: { $transaction: (work: (client: typeof tx) => unknown) => work(tx) },
}));

const workspace = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const job = {
  id,
  status: 'SUCCEEDED',
  attemptCount: 1,
  lastErrorCategory: null,
  createdAt: new Date('2026-11-25T00:00:00.000Z'),
  completedAt: new Date('2026-11-25T00:00:05.000Z'),
};
const key = `browser-fixture-selection:${id}:step-2`;
const admission = {
  operationHash: createHash('sha256').update(key).digest('hex'),
  settledAt: job.completedAt,
};

describe('observed model run reporting', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tx.job.findFirst.mockResolvedValue(job);
    tx.aiUsageEvent.findMany.mockResolvedValue([]);
    tx.aiProviderCallAdmission.findMany.mockResolvedValue([]);
  });

  it('reports zero recorded calls and zero estimated cost for a completed run without reservations', async () => {
    await expect(reportObservedModelJob(workspace, actor, id)).resolves.toMatchObject({
      status: 'SUCCEEDED',
      recordedCalls: 0,
      admittedSteps: 0,
      estimatedCostUsdMicros: '0',
      queueToCompletionMs: 5000,
      steps: [],
    });
  });

  it('matches the exact step key and preserves the stored integer cost', async () => {
    tx.aiProviderCallAdmission.findMany.mockResolvedValue([admission]);
    tx.aiUsageEvent.findMany.mockResolvedValue([
      {
        idempotencyKey: key,
        status: 'SUCCESS',
        model: 'test-model',
        promptVersion: 'browser-observed-choice-v1',
        inputTokens: 320,
        outputTokens: 27,
        latencyMs: 222,
        estimatedCostUsdMicros: 123n,
      },
    ]);
    await expect(reportObservedModelJob(workspace, actor, id)).resolves.toMatchObject({
      recordedCalls: 1,
      admittedSteps: 1,
      estimatedCostUsdMicros: '123',
      steps: [{ ordinal: 2, admitted: true, settled: true, estimatedCostUsdMicros: '123' }],
    });
    expect(tx.aiUsageEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: workspace,
          actorUserId: actor,
          idempotencyKey: { in: expect.arrayContaining([key]) },
        }),
      }),
    );
    tx.aiProviderCallAdmission.findMany.mockResolvedValueOnce([{ ...admission, settledAt: null }]);
    await expect(reportObservedModelJob(workspace, actor, id)).resolves.toMatchObject({
      recordedCalls: 1,
      estimatedCostUsdMicros: null,
      steps: [{ ordinal: 2, settled: false, estimatedCostUsdMicros: '123' }],
    });
  });

  it('leaves the estimated cost unknown with missing usage or while the job is active', async () => {
    tx.aiProviderCallAdmission.findMany.mockResolvedValueOnce([admission]);
    await expect(reportObservedModelJob(workspace, actor, id)).resolves.toMatchObject({
      recordedCalls: 0,
      admittedSteps: 1,
      estimatedCostUsdMicros: null,
      steps: [{ ordinal: 2, status: null }],
    });
    tx.job.findFirst.mockResolvedValueOnce({ ...job, status: 'LEASED', completedAt: null });
    await expect(reportObservedModelJob(workspace, actor, id)).resolves.toMatchObject({
      status: 'LEASED',
      estimatedCostUsdMicros: null,
    });
  });

  it('does not read costs when the job is outside the active owner scope', async () => {
    tx.job.findFirst.mockResolvedValue(null);
    await expect(reportObservedModelJob(workspace, actor, id)).rejects.toMatchObject({
      category: 'INVALID_PLAN',
    });
    expect(tx.aiUsageEvent.findMany).not.toHaveBeenCalled();
    expect(tx.aiProviderCallAdmission.findMany).not.toHaveBeenCalled();
  });
});
