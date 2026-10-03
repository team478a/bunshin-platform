import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  eraseAccountImprovementFeedback,
  purgeExpiredImprovementFeedback,
  IMPROVEMENT_FEEDBACK_RETENTION_POLICY,
} from '../src/improvement-feedback-retention';
afterEach(() => vi.unstubAllGlobals());
describe('approved feedback retention internal boundary', () => {
  it('fixes the reviewed policy without configuring a public entry or scheduler', () => {
    expect(IMPROVEMENT_FEEDBACK_RETENTION_POLICY).toEqual({
      approved: true,
      retentionPolicyVersion: 'feedback-retention-v1',
      disclosurePolicyVersion: 'feedback-admin-preview-v1',
      minimumBucketReporters: 5,
      candidateRetentionDays: 90,
    });
    expect(Object.isFrozen(IMPROVEMENT_FEEDBACK_RETENTION_POLICY)).toBe(true);
  });
  it.each([0, 1001, 1.5])(
    'rejects invalid purge batch %s before a DB transaction',
    async (limit) => {
      const transaction = vi.fn();
      await expect(
        purgeExpiredImprovementFeedback({ $transaction: transaction } as never, {
          workspaceId: '00000000-0000-4000-8000-000000000001',
          serviceId: '00000000-0000-4000-8000-000000000002',
          limit,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(transaction).not.toHaveBeenCalled();
    },
  );
  it('rejects unscoped purge and an invalid clock', async () => {
    const transaction = vi.fn();
    for (const input of [
      { workspaceId: '', serviceId: '' },
      {
        workspaceId: '00000000-0000-4000-8000-000000000001',
        serviceId: '00000000-0000-4000-8000-000000000002',
        now: new Date(NaN),
      },
    ]) {
      await expect(
        purgeExpiredImprovementFeedback({ $transaction: transaction } as never, input),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect(transaction).not.toHaveBeenCalled();
  });
  it('deletes original actor/actual-owned signals and removes only that audit actor', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('network forbidden');
    });
    const tx = {
      improvementFeedback: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      improvementTriageOperation: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    expect(await eraseAccountImprovementFeedback(tx as never, 'synthetic-owner')).toEqual({
      sourcesDeleted: 2,
      auditActorsErased: 1,
    });
    expect(tx.improvementFeedback.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ actorUserId: 'synthetic-owner' }, { bunshin: { ownerUserId: 'synthetic-owner' } }],
      },
    });
    expect(tx.improvementTriageOperation.updateMany).toHaveBeenCalledWith({
      where: { actorUserId: 'synthetic-owner' },
      data: { actorUserId: null },
    });
  });
  it('does not conceal audit erasure failure (caller transaction must roll back)', async () => {
    const tx = {
      improvementFeedback: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      improvementTriageOperation: {
        updateMany: vi.fn().mockRejectedValue(new Error('erase fault')),
      },
    };
    await expect(eraseAccountImprovementFeedback(tx as never, 'synthetic-owner')).rejects.toThrow(
      'erase fault',
    );
  });
  it('detaches destructive scope and clock before a lock await', async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const model = () => ({
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    });
    const tx = {
      $queryRaw: vi.fn(() => barrier),
      improvementFeedback: model(),
      improvementTriageCandidate: model(),
      improvementTriageOperation: model(),
    };
    const client = { $transaction: (work: (value: typeof tx) => Promise<unknown>) => work(tx) };
    const input = {
      workspaceId: '00000000-0000-4000-8000-000000000001',
      serviceId: '00000000-0000-4000-8000-000000000002',
      now: new Date('2026-10-03T03:00:00Z'),
    };
    const pending = purgeExpiredImprovementFeedback(client as never, input);
    input.workspaceId = '00000000-0000-4000-8000-000000000003';
    input.serviceId = '00000000-0000-4000-8000-000000000004';
    input.now.setTime(0);
    release();
    await pending;
    expect(tx.improvementFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: '00000000-0000-4000-8000-000000000001',
          serviceId: '00000000-0000-4000-8000-000000000002',
          createdAt: { lte: new Date('2026-07-05T03:00:00Z') },
        },
      }),
    );
    expect(tx.improvementTriageCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: '00000000-0000-4000-8000-000000000001',
          serviceId: '00000000-0000-4000-8000-000000000002',
          expiresAt: { lte: new Date('2026-10-03T03:00:00Z') },
        },
      }),
    );
  });
});
