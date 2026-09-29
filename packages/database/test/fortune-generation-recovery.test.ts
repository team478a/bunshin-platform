import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { recoverStaleFortuneReadings } from '../src';

const now = new Date('2026-09-28T12:00:00Z');
const reading = {
  id: 'reading-a',
  workspaceId: 'workspace-a',
  groupId: 'service-a',
  serviceSettingId: 'setting-a',
  participantId: 'participant-a',
  memberUserId: 'user-a',
  updatedAt: new Date('2026-09-28T11:40:00Z'),
  readingText: '承認された標準結果',
  actionStep: '今日できる小さな行動',
};

function client(rows: unknown[] = [reading]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findJob = vi.fn().mockResolvedValue(null);
  const db = {
    fortuneReading: { findMany, updateMany },
    job: { findFirst: findJob },
  } as unknown as PrismaClient;
  return { db, findMany, updateMany, findJob };
}

describe('interrupted fortune generation recovery', () => {
  it('preserves queued or retrying AI generation rather than racing its worker', async () => {
    const fake = client();
    fake.findJob.mockResolvedValue({ id: 'queued-job' });
    await expect(recoverStaleFortuneReadings(fake.db, now)).resolves.toEqual({
      candidates: 1,
      recovered: 0,
      failed: 0,
    });
    expect(fake.updateMany).not.toHaveBeenCalled();
    expect(fake.findJob).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: reading.workspaceId,
          requestedBy: reading.memberUserId,
          payloadReference: 'fortune-generation:setting-a:reading-a',
          status: { in: ['PENDING', 'LEASED', 'RETRY_SCHEDULED'] },
        }),
      }),
    );
  });
  it('only selects undeleted generating readings stale for at least ten minutes, in bounded order', async () => {
    const fake = client([]);
    await expect(recoverStaleFortuneReadings(fake.db, now)).resolves.toEqual({
      candidates: 0,
      recovered: 0,
      failed: 0,
    });
    expect(fake.findMany).toHaveBeenCalledWith({
      where: {
        status: 'GENERATING',
        deletedAt: null,
        updatedAt: { lte: new Date('2026-09-28T11:50:00Z') },
      },
      select: {
        id: true,
        workspaceId: true,
        groupId: true,
        serviceSettingId: true,
        participantId: true,
        memberUserId: true,
        updatedAt: true,
        readingText: true,
        actionStep: true,
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    expect(fake.updateMany).not.toHaveBeenCalled();
  });

  it('preserves the original result and card while restoring READY_BASIC under the full owner scope', async () => {
    const fake = client();
    await expect(recoverStaleFortuneReadings(fake.db, now)).resolves.toEqual({
      candidates: 1,
      recovered: 1,
      failed: 0,
    });
    expect(fake.updateMany).toHaveBeenCalledWith({
      where: { ...reading, status: 'GENERATING', deletedAt: null },
      data: {
        status: 'READY_BASIC',
        failureCode: 'AI_GENERATION_INTERRUPTED',
        modelName: null,
      },
    });
  });

  it.each([
    { readingText: null, actionStep: '行動' },
    { readingText: '本文', actionStep: null },
    { readingText: '  ', actionStep: '行動' },
    { readingText: '本文', actionStep: '\n' },
  ])('does not publish a result with missing approved content: %o', async (missing) => {
    const fake = client([{ ...reading, ...missing }]);
    await expect(recoverStaleFortuneReadings(fake.db, now)).resolves.toEqual({
      candidates: 1,
      recovered: 0,
      failed: 1,
    });
    expect(fake.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'FAILED',
          failureCode: 'AI_GENERATION_INTERRUPTED_MISSING_BASIC',
          modelName: null,
        },
      }),
    );
  });

  it('does not count or overwrite concurrently completed, deleted or refreshed readings', async () => {
    const fake = client();
    fake.updateMany.mockResolvedValue({ count: 0 });
    await expect(recoverStaleFortuneReadings(fake.db, now)).resolves.toEqual({
      candidates: 1,
      recovered: 0,
      failed: 0,
    });
  });

  it('does not transition a recovered reading again when the cron repeats', async () => {
    const fake = client();
    fake.findMany.mockResolvedValueOnce([reading]).mockResolvedValueOnce([]);
    await recoverStaleFortuneReadings(fake.db, now);
    await expect(recoverStaleFortuneReadings(fake.db, now)).resolves.toEqual({
      candidates: 0,
      recovered: 0,
      failed: 0,
    });
    expect(fake.updateMany).toHaveBeenCalledTimes(1);
  });

  it('never borrows scope from another selected participant or service', async () => {
    const other = {
      ...reading,
      id: 'reading-b',
      workspaceId: 'workspace-b',
      groupId: 'service-b',
      serviceSettingId: 'setting-b',
      participantId: 'participant-b',
      memberUserId: 'user-b',
    };
    const fake = client([reading, other]);
    await recoverStaleFortuneReadings(fake.db, now);
    expect(fake.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { ...reading, status: 'GENERATING', deletedAt: null } }),
    );
    expect(fake.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { ...other, status: 'GENERATING', deletedAt: null } }),
    );
  });

  it('surfaces database failures so the next invocation can safely retry', async () => {
    const fake = client();
    fake.updateMany.mockRejectedValue(new Error('database unavailable'));
    await expect(recoverStaleFortuneReadings(fake.db, now)).rejects.toThrow('database unavailable');
  });
});
