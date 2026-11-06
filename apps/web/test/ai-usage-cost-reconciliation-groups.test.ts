import { describe, expect, it } from 'vitest';
import {
  canConfirmNoProviderCost,
  groupUnknownAiUsageCosts,
} from '../app/(app)/admin/ai/ai-usage-cost-reconciliation-groups';

const row = (overrides: Partial<Parameters<typeof canConfirmNoProviderCost>[0]> = {}) => ({
  id: crypto.randomUUID(),
  provider: 'openai',
  taskType: 'DAILY_MISSION_PIPELINE',
  model: 'gpt-5.2',
  status: 'FAILED' as const,
  inputTokens: null,
  outputTokens: null,
  occurredAt: '2026-11-06T00:00:00.000Z',
  ...overrides,
});

describe('AI usage cost reconciliation groups', () => {
  it('groups records by provider, model, and outcome', () => {
    const groups = groupUnknownAiUsageCosts([
      row(),
      row(),
      row({ model: 'gpt-5-mini-2025-08-07', status: 'SUCCESS', inputTokens: 10, outputTokens: 5 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.rows).toHaveLength(2);
    expect(groups[0]?.canConfirmNoProviderCost).toBe(true);
    expect(groups[1]?.canConfirmNoProviderCost).toBe(false);
  });

  it('never offers bulk zero cost when a failed record contains token usage', () => {
    expect(canConfirmNoProviderCost(row({ inputTokens: 1 }))).toBe(false);
    expect(canConfirmNoProviderCost(row({ outputTokens: 1 }))).toBe(false);
  });

  it('never offers bulk zero cost for successful records', () => {
    expect(canConfirmNoProviderCost(row({ status: 'SUCCESS' }))).toBe(false);
  });
});
