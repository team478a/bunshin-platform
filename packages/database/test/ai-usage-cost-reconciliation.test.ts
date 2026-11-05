import { describe, expect, it, vi } from 'vitest';
import { PrismaAiUsageCostReconciliationRepository } from '../src/ai-usage-cost-reconciliation';

const input = {
  actorUserId: '11111111-1111-4111-8111-111111111111',
  environment: 'PRODUCTION' as const,
  provider: 'OPENAI' as const,
  monthlyFrom: new Date('2026-11-01T00:00:00Z'),
  now: new Date('2026-12-01T00:00:00Z'),
  reason: 'Provider未送信を運用ログで確認',
  evidenceReference: 'vercel-log:daily-mission-2026-11',
  updates: [
    {
      usageEventId: '22222222-2222-4222-8222-222222222222',
      estimatedCostUsdMicros: 0,
      pricingVersion: 'no-provider-call-v1',
    },
  ],
};

function client(row: {
  status: 'SUCCESS' | 'FAILED';
  inputTokens: number | null;
  outputTokens: number | null;
}) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const transactionClient = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    aiProviderConfiguration: { findFirst: vi.fn().mockResolvedValue({ id: 'configuration-id' }) },
    aiUsageEvent: {
      findUnique: vi.fn().mockResolvedValue({
        id: input.updates[0]!.usageEventId,
        provider: 'openai',
        occurredAt: new Date('2026-11-02T00:00:00Z'),
        estimatedCostUsdMicros: null,
        pricingVersion: null,
        ...row,
      }),
      updateMany,
    },
    aiProviderConfigurationAudit: { create: vi.fn().mockResolvedValue({}) },
  };
  const transaction = vi.fn(async (operation: (tx: typeof transactionClient) => Promise<unknown>) =>
    operation(transactionClient),
  );
  return {
    repository: new PrismaAiUsageCostReconciliationRepository({
      platformAdmin: { findFirst: vi.fn().mockResolvedValue({ role: 'SUPER_ADMIN' }) },
      $transaction: transaction,
    } as never),
    updateMany,
  };
}

describe('AI usage zero-cost reconciliation persistence', () => {
  it('allows evidenced zero cost only for a failed event without token usage', async () => {
    const { repository, updateMany } = client({
      status: 'FAILED',
      inputTokens: null,
      outputTokens: null,
    });
    await expect(repository.repairUnknownCosts(input)).resolves.toMatchObject({ updated: 1 });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { estimatedCostUsdMicros: 0n, pricingVersion: 'no-provider-call-v1' },
      }),
    );
  });

  it.each([
    { status: 'SUCCESS' as const, inputTokens: null, outputTokens: null },
    { status: 'FAILED' as const, inputTokens: 1, outputTokens: null },
    { status: 'FAILED' as const, inputTokens: null, outputTokens: 1 },
  ])('rejects zero cost for an ineligible event %#', async (row) => {
    const { repository, updateMany } = client(row);
    await expect(repository.repairUnknownCosts(input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
