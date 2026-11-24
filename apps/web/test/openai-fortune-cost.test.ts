import { describe, expect, it } from 'vitest';
import { fortuneOpenAiUsageCost } from '../src/providers/openai-fortune-cost';

describe('fortuneOpenAiUsageCost', () => {
  it('uses published GPT-5.6 Terra text rates, including the long-context tier', () => {
    expect(fortuneOpenAiUsageCost('gpt-5.6-terra', 2_000, 500, 60_000, true)).toEqual({
      estimatedCostUsdMicros: 10_000,
      pricingVersion: 'openai-gpt-5.6-terra-standard-2026-11-24',
    });
    expect(
      fortuneOpenAiUsageCost('gpt-5.6-terra', 272_000, 500, 60_000, true).estimatedCostUsdMicros,
    ).toBe(550_000);
    expect(
      fortuneOpenAiUsageCost('gpt-5.6-terra', 272_001, 500, 60_000, true).estimatedCostUsdMicros,
    ).toBe(1_097_004);
  });

  it('uses the configured estimate when usage or pricing is unavailable', () => {
    for (const [model, inputTokens] of [
      ['gpt-5.6-terra', null],
      ['another-model', 500],
    ] as const) {
      expect(fortuneOpenAiUsageCost(model, inputTokens, 20, 60_000, true)).toEqual({
        estimatedCostUsdMicros: 60_000,
        pricingVersion: 'admin-request-cost-v1',
      });
    }
    expect(fortuneOpenAiUsageCost('gpt-5.6-terra', null, null, 60_000, false)).toEqual({
      estimatedCostUsdMicros: 0,
      pricingVersion: null,
    });
  });
});
