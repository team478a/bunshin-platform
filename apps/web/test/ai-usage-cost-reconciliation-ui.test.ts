import { describe, expect, it } from 'vitest';
import { selectAiUsageCostReconciliationUpdates } from '../app/(app)/admin/ai/ai-usage-cost-reconciliation';

describe('AI usage cost reconciliation selection', () => {
  const rows = [{ id: 'usage-1' }];

  it('selects an explicitly entered zero with a pricing evidence version', () => {
    expect(
      selectAiUsageCostReconciliationUpdates(
        rows,
        { 'usage-1': '0' },
        { 'usage-1': 'provider-no-charge-v1' },
      ),
    ).toEqual([
      {
        usageEventId: 'usage-1',
        estimatedCostUsdMicros: 0,
        pricingVersion: 'provider-no-charge-v1',
      },
    ]);
  });

  it('does not treat an empty cost as zero or accept a negative cost', () => {
    expect(
      selectAiUsageCostReconciliationUpdates(
        rows,
        { 'usage-1': '' },
        { 'usage-1': 'provider-no-charge-v1' },
      ),
    ).toEqual([]);
    expect(
      selectAiUsageCostReconciliationUpdates(
        rows,
        { 'usage-1': '-1' },
        { 'usage-1': 'provider-no-charge-v1' },
      ),
    ).toEqual([]);
  });
});
