const pricingVersion = 'openai-gpt-5.6-terra-standard-2026-11-24';

// USD micros per token, based on https://developers.openai.com/api/docs/models/gpt-5.6-terra.
// Use the standard uncached rate for the operating estimate.
export function fortuneOpenAiUsageCost(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
  fallbackUsdMicros: number,
  attempted: boolean,
) {
  if (!attempted) return { estimatedCostUsdMicros: 0, pricingVersion: null };
  if (model === 'gpt-5.6-terra' && inputTokens !== null && outputTokens !== null) {
    const longContext = inputTokens > 272_000;
    return {
      estimatedCostUsdMicros:
        inputTokens * (longContext ? 4 : 2) + outputTokens * (longContext ? 18 : 12),
      pricingVersion,
    };
  }
  return { estimatedCostUsdMicros: fallbackUsdMicros, pricingVersion: 'admin-request-cost-v1' };
}
