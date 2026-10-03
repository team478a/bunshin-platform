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
});
