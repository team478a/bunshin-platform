import { describe, expect, it, vi } from 'vitest';
import {
  PrismaFortuneGenerationQueue,
  PrismaFortuneRepository,
  verifyFortuneGenerationJob,
} from '../src';

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const scope = {
  id: id('1'),
  workspaceId: id('2'),
  groupId: id('3'),
  bunshinId: id('4'),
  aiEnabled: true,
};
const actorUserId = id('5');
const readingId = id('6');
const revision = new Date('2026-09-29T05:00:00Z');
const lease = {
  workspaceId: scope.workspaceId,
  bunshinId: scope.bunshinId,
  serviceSettingId: scope.id,
  jobId: id('7'),
  workerId: 'worker-a',
  attemptCount: 2,
};
const input = { serviceSlug: 'fortune-a', actorUserId, readingId };
const reading = {
  id: readingId,
  workspaceId: scope.workspaceId,
  groupId: scope.groupId,
  serviceSettingId: scope.id,
  memberUserId: actorUserId,
  participantId: id('8'),
  status: 'READY_BASIC',
  updatedAt: revision,
  localDate: revision,
  theme: 'WORK',
  cardCode: 'THE_FOOL',
  orientation: 'UPRIGHT',
  readingText: '承認済み本文',
  actionStep: '今日の行動',
  createdAt: revision,
  knowledgeVersionId: null,
};
const job = {
  id: lease.jobId,
  workspaceId: scope.workspaceId,
  bunshinId: scope.bunshinId,
  requestedBy: actorUserId,
  capabilityType: 'FORTUNE',
  jobType: 'FORTUNE_READING_GENERATE',
  payloadReference: `fortune-generation:${scope.id}:${readingId}`,
  status: 'PENDING',
};

function setup() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: lease.jobId }]),
    fortuneServiceSetting: { findFirst: vi.fn().mockResolvedValue(scope) },
    fortuneReading: {
      findFirst: vi.fn().mockResolvedValue(reading),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({ ...reading, updatedAt: revision }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    fortuneParticipant: { findFirst: vi.fn().mockResolvedValue(null) },
    fortuneFeedback: { findUnique: vi.fn().mockResolvedValue(null) },
    job: {
      findFirst: vi.fn().mockResolvedValue({ id: lease.jobId }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(job),
    },
  };
  const db = {
    $transaction: vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return {
    tx,
    db,
    queue: new PrismaFortuneGenerationQueue(db as never, 'DEVELOPMENT'),
    repository: new PrismaFortuneRepository(db as never),
  };
}

describe('fortune queue and lease isolation', () => {
  it('atomically enqueues only a scoped approved reading with three attempts and reference-only payload', async () => {
    const test = setup();
    await expect(test.queue.enqueue(input)).resolves.toMatchObject({
      id: readingId,
      status: 'GENERATING',
      body: reading.readingText,
    });
    expect(test.db.$transaction).toHaveBeenCalledOnce();
    expect(test.tx.job.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: expect.objectContaining({
          environment: 'DEVELOPMENT',
          idempotencyKey: job.payloadReference,
          workspaceId: scope.workspaceId,
          bunshinId: scope.bunshinId,
          requestedBy: actorUserId,
          maxAttempts: 3,
          payloadReference: job.payloadReference,
        }),
      }),
    );
    expect(test.tx.job.findUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        environment_idempotencyKey: {
          environment: 'DEVELOPMENT',
          idempotencyKey: job.payloadReference,
        },
      },
    });
    expect(test.tx.fortuneReading.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          serviceSettingId: scope.id,
          memberUserId: actorUserId,
          deletedAt: null,
          participant: expect.objectContaining({ userId: actorUserId, serviceSettingId: scope.id }),
        }),
      }),
    );
  });

  it('reuses a concurrently inserted job after the DB skips the duplicate', async () => {
    const test = setup();
    test.tx.job.createMany.mockResolvedValue({ count: 0 });
    await expect(test.queue.enqueue(input)).resolves.toMatchObject({ status: 'GENERATING' });
    expect(test.tx.job.createMany).toHaveBeenCalledOnce();
    expect(test.tx.job.findUniqueOrThrow).toHaveBeenCalledOnce();
    expect(test.tx.job.createMany.mock.invocationCallOrder[0]).toBeLessThan(
      test.tx.job.findUniqueOrThrow.mock.invocationCallOrder[0]!,
    );
  });

  it.each(['SUCCEEDED', 'DEAD', 'CANCELLED'])(
    'does not restart a terminal %s job',
    async (status) => {
      const test = setup();
      test.tx.job.createMany.mockResolvedValue({ count: 0 });
      test.tx.job.findUniqueOrThrow.mockResolvedValue({ ...job, status });
      await expect(test.queue.enqueue(input)).resolves.toMatchObject({ status: 'READY_BASIC' });
      expect(test.tx.fortuneReading.updateMany).not.toHaveBeenCalled();
    },
  );

  it('rejects an idempotency collision with another requester', async () => {
    const test = setup();
    test.tx.job.createMany.mockResolvedValue({ count: 0 });
    test.tx.job.findUniqueOrThrow.mockResolvedValue({ ...job, requestedBy: id('99') });
    await expect(test.queue.enqueue(input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(test.tx.fortuneReading.updateMany).not.toHaveBeenCalled();
  });

  it('does not enqueue when service, participant ownership or capability is unavailable', async () => {
    const test = setup();
    test.tx.fortuneServiceSetting.findFirst.mockResolvedValue(null);
    await expect(test.queue.enqueue(input)).resolves.toBeNull();
    expect(test.tx.job.createMany).not.toHaveBeenCalled();
    expect(test.tx.job.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('does not claim a job from another workspace, service or Bunshin', async () => {
    for (const key of ['workspaceId', 'serviceSettingId', 'bunshinId'] as const) {
      const test = setup();
      await expect(
        test.repository.claimAiGeneration({ ...input, jobLease: { ...lease, [key]: id('99') } }),
      ).resolves.toBeNull();
      expect(test.tx.fortuneReading.updateMany).not.toHaveBeenCalled();
    }
  });

  it('requires the current requester, worker, attempt and unexpired lease before gathering Memory', async () => {
    const test = setup();
    test.tx.job.findFirst.mockResolvedValue(null);
    await expect(
      test.repository.claimAiGeneration({ ...input, jobLease: lease }),
    ).resolves.toBeNull();
    expect(test.tx.$queryRaw).toHaveBeenCalledOnce();
    expect(test.tx.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          requestedBy: actorUserId,
          workspaceId: scope.workspaceId,
          bunshinId: scope.bunshinId,
          status: 'LEASED',
          leaseOwner: 'worker-a',
          attemptCount: 2,
          leaseExpiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
    expect(test.tx.fortuneParticipant.findFirst).not.toHaveBeenCalled();
  });

  it('keeps the reading generating and assigns a revision for the current attempt', async () => {
    const test = setup();
    await expect(
      test.repository.claimAiGeneration({ ...input, jobLease: lease }),
    ).resolves.toMatchObject({
      generationRevision: revision,
      jobAttempt: { jobId: lease.jobId, attemptCount: 2 },
    });
    expect(test.tx.fortuneReading.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'GENERATING',
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          deletedAt: null,
        }),
      }),
    );
  });

  it.each(['complete', 'fallback'])('rejects a stale lease before %s', async (operation) => {
    const test = setup();
    test.tx.job.findFirst.mockResolvedValue(null);
    const value = { ...input, jobLease: lease, generationRevision: revision };
    const result =
      operation === 'complete'
        ? test.repository.completeAiGeneration({
            ...value,
            output: {
              body: '本文',
              actionStep: '行動',
              model: 'mock',
              promptVersion: 'v1',
              inputTokens: 1,
              outputTokens: 2,
              latencyMs: 3,
            },
          })
        : test.repository.fallbackAiGeneration({ ...value, failureCode: 'TEST' });
    await expect(result).resolves.toBeNull();
    expect(test.tx.fortuneReading.updateMany).not.toHaveBeenCalled();
  });

  it('does not overwrite a recovered, deleted or newly revised reading on completion', async () => {
    const test = setup();
    test.tx.fortuneReading.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      test.repository.completeAiGeneration({
        ...input,
        jobLease: lease,
        generationRevision: revision,
        output: {
          body: '本文',
          actionStep: '行動',
          model: 'mock',
          promptVersion: 'v1',
          inputTokens: 1,
          outputTokens: 2,
          latencyMs: 3,
        },
      }),
    ).resolves.toBeNull();
    expect(test.tx.fortuneReading.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          updatedAt: revision,
          status: 'GENERATING',
          deletedAt: null,
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          memberUserId: actorUserId,
        }),
      }),
    );
  });

  it('revalidates both the lease and reading revision at the provider boundary', async () => {
    const test = setup();
    test.tx.fortuneReading.findFirst.mockResolvedValue(null);
    await expect(
      verifyFortuneGenerationJob(test.db as never, {
        ...input,
        jobLease: lease,
        generationRevision: revision,
      }),
    ).resolves.toBe(false);
    expect(test.tx.fortuneReading.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          updatedAt: revision,
          status: 'GENERATING',
          deletedAt: null,
          memberUserId: actorUserId,
        }),
      }),
    );
  });
});
