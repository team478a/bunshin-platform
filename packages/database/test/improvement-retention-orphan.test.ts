import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaImprovementFeedbackRetentionJobRepository } from '../src/improvement-feedback-retention-jobs';

beforeEach(() =>
  vi.stubGlobal('fetch', () => {
    throw new Error('network forbidden');
  }),
);
afterEach(() => vi.unstubAllGlobals());
describe('retention orphan inspection internal summary', () => {
  it.each([true, false])(
    'reports presence %s without exposing scope identities',
    async (detected) => {
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(0),
        $queryRaw: vi.fn().mockResolvedValueOnce([{ detected }]).mockResolvedValueOnce([]),
      };
      const transaction = vi.fn((work: (value: typeof tx) => Promise<unknown>) => work(tx));
      const client = { $transaction: transaction };
      const result = await new PrismaImprovementFeedbackRetentionJobRepository(
        client as never,
        () => new Date('2026-10-03T04:00:00Z'),
      ).schedule('DEVELOPMENT');
      expect(result).toEqual({ scheduled: 0, orphanedScopesDetected: detected });
      expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
        maxWait: 2_000,
        timeout: 3_000,
        isolationLevel: 'RepeatableRead',
      });
      expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    },
  );
  it('does not turn inspection failure or a missing result into healthy false', async () => {
    for (const response of [
      () => Promise.resolve([]),
      () => Promise.reject(new Error('inspection failure')),
    ]) {
      const tx = { $executeRaw: vi.fn().mockResolvedValue(0), $queryRaw: vi.fn(response) };
      const client = { $transaction: (work: (value: typeof tx) => Promise<unknown>) => work(tx) };
      await expect(
        new PrismaImprovementFeedbackRetentionJobRepository(client as never).schedule(
          'DEVELOPMENT',
        ),
      ).rejects.toThrow();
      expect(tx.$queryRaw).toHaveBeenCalledOnce();
    }
  });
  it('validates environment and clock before starting inspection', async () => {
    const transaction = vi.fn();
    const client = { $transaction: transaction };
    await expect(
      new PrismaImprovementFeedbackRetentionJobRepository(client as never).schedule(
        'unknown' as never,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      new PrismaImprovementFeedbackRetentionJobRepository(
        client as never,
        () => new Date(NaN),
      ).schedule('DEVELOPMENT'),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(transaction).not.toHaveBeenCalled();
  });
});
