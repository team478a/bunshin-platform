import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaOpsMorningDigestRunRepository } from '../src/ops-morning-digest-runs';

function fakeClient() {
  const $queryRaw = vi.fn().mockResolvedValue([{ id: 'run-1', attempt_count: 1 }]);
  const opsMorningDigestRun = {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
  };
  return {
    value: { $queryRaw, opsMorningDigestRun } as unknown as PrismaClient,
    $queryRaw,
    opsMorningDigestRun,
  };
}

describe('PrismaOpsMorningDigestRunRepository', () => {
  it('claims by environment and date with an expiring lease using one atomic upsert', async () => {
    const db = fakeClient();
    const now = new Date('2026-10-19T22:30:00.000Z');
    const result = await new PrismaOpsMorningDigestRunRepository(db.value).claim({
      environment: 'PRODUCTION',
      targetDate: '2026-10-19',
      now,
      leaseMilliseconds: 1234,
    });
    const query = (db.$queryRaw.mock.calls[0]![0] as TemplateStringsArray).join(' ');
    expect(result).toEqual({ id: 'run-1', attemptCount: 1 });
    expect(query).toContain('ON CONFLICT');
    expect(query).toContain('lease_expires_at');
    expect(query).toContain('"status" = \'CLAIMED\'');
  });

  it('settles only the attempt that still owns the claim', async () => {
    const db = fakeClient();
    const repository = new PrismaOpsMorningDigestRunRepository(db.value);
    const claim = { id: 'run-1', attemptCount: 3 };
    expect(await repository.markSent({ claim, sentAt: new Date() })).toBe(true);
    expect(db.opsMorningDigestRun.updateMany).toHaveBeenCalledWith({
      where: { id: claim.id, status: 'CLAIMED', attemptCount: 3 },
      data: { status: 'SENT', leaseExpiresAt: null, errorCategory: null, sentAt: expect.any(Date) },
    });
    db.opsMorningDigestRun.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(
      await repository.markFailed({
        claim,
        errorCategory: 'EMAIL_PROVIDER_FAILED',
        failedAt: new Date(),
      }),
    ).toBe(false);
  });

  it('distinguishes a missing previous date before history from a missed send after history began', async () => {
    const db = fakeClient();
    db.opsMorningDigestRun.findUnique.mockResolvedValue(null);
    const repository = new PrismaOpsMorningDigestRunRepository(db.value);
    db.opsMorningDigestRun.findFirst.mockResolvedValueOnce(null);
    expect(
      await repository.deliveryStatus({ environment: 'PRODUCTION', targetDate: '2026-10-19' }),
    ).toBe('BEFORE_HISTORY');
    db.opsMorningDigestRun.findFirst.mockResolvedValueOnce({
      targetDate: new Date('2026-10-18T00:00:00Z'),
    });
    expect(
      await repository.deliveryStatus({ environment: 'PRODUCTION', targetDate: '2026-10-19' }),
    ).toBe('NOT_SENT');
  });

  it('reads only the current run status metadata needed by the admin preview', async () => {
    const db = fakeClient();
    const expected = {
      status: 'FAILED',
      leaseExpiresAt: null,
      errorCategory: 'EMAIL_PROVIDER_FAILED',
    };
    db.opsMorningDigestRun.findUnique.mockResolvedValue(expected);

    const result = await new PrismaOpsMorningDigestRunRepository(db.value).runState({
      environment: 'PRODUCTION',
      targetDate: '2026-10-19',
    });

    expect(result).toBe(expected);
    expect(db.opsMorningDigestRun.findUnique).toHaveBeenCalledWith({
      where: {
        environment_targetDate: {
          environment: 'PRODUCTION',
          targetDate: new Date('2026-10-19T00:00:00.000Z'),
        },
      },
      select: { status: true, leaseExpiresAt: true, errorCategory: true },
    });
  });
});
