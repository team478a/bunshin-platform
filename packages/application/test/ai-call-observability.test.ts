import { describe, expect, it } from 'vitest';
import {
  estimateAiCallCost,
  parseAiTokenPricingRegistry,
  validateAiCallMeasurement,
  type AiCallMeasurement,
  type AiTokenPricing,
} from '../src';
const measurement: AiCallMeasurement = {
  provider: 'openai',
  model: 'synthetic',
  inputTokens: 1000,
  outputTokens: 200,
  cachedInputTokens: 400,
  latencyMs: 52,
  success: true,
  errorCategory: null,
  validationResult: 'PASSED',
  fallbackUsed: false,
  occurredAt: '2026-10-06T00:00:00Z',
};
const price: AiTokenPricing = {
  provider: 'openai',
  model: 'synthetic',
  effectiveFrom: '2026-10-01T00:00:00Z',
  inputPriceMicrosPerMillion: 2_000_000,
  outputPriceMicrosPerMillion: 8_000_000,
  cachedInputPriceMicrosPerMillion: 200_000,
  currency: 'USD',
  pricingVersion: 'synthetic-v1',
};
describe('AI call observability', () => {
  it('prices uncached + cached input separately with integer micro USD and fixed version', () => {
    expect(estimateAiCallCost(measurement, [price])).toEqual({
      costStatus: 'ESTIMATED',
      inputCostUsdMicros: 1280,
      outputCostUsdMicros: 1600,
      totalCostUsdMicros: 2880,
      pricing: price,
    });
  });
  it.each([
    { model: 'unpriced' },
    { inputTokens: null, cachedInputTokens: null },
    { outputTokens: null },
    { cachedInputTokens: null },
  ])('missing prices/usage remain UNKNOWN, not zero: %o', (change) => {
    expect(estimateAiCallCost({ ...measurement, ...change }, [price])).toMatchObject({
      costStatus: 'UNKNOWN',
      totalCostUsdMicros: null,
    });
  });
  it('no cache price is safe only with explicitly zero cached usage', () => {
    const p = { ...price, cachedInputPriceMicrosPerMillion: null };
    expect(estimateAiCallCost(measurement, [p]).costStatus).toBe('UNKNOWN');
    expect(estimateAiCallCost({ ...measurement, cachedInputTokens: 0 }, [p]).costStatus).toBe(
      'ESTIMATED',
    );
  });
  it('selects historical price by occurrence, not current time or future price', () => {
    const future = { ...price, effectiveFrom: '2026-10-07T00:00:00Z', pricingVersion: 'v2' };
    expect(estimateAiCallCost(measurement, [future, price]).pricing?.pricingVersion).toBe(
      'synthetic-v1',
    );
    expect(estimateAiCallCost(measurement, [future]).costStatus).toBe('UNKNOWN');
  });
  it('rounds up per component and accepts observed zero usage without inventing it', () => {
    expect(
      estimateAiCallCost(
        { ...measurement, inputTokens: 1, outputTokens: 0, cachedInputTokens: 0 },
        [{ ...price, inputPriceMicrosPerMillion: 1 }],
      ).totalCostUsdMicros,
    ).toBe(1);
    expect(
      estimateAiCallCost(
        { ...measurement, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
        [price],
      ).totalCostUsdMicros,
    ).toBe(0);
  });
  it('rejects body fields, invalid counts, inconsistent outcomes and duplicate pricing', () => {
    for (const change of [
      { prompt: 'private' },
      { inputTokens: -1 },
      { outputTokens: NaN },
      { cachedInputTokens: 1001 },
      { success: false },
      { model: 'raw text with secrets' },
    ])
      expect(() => validateAiCallMeasurement({ ...measurement, ...change })).toThrow();
    expect(() => parseAiTokenPricingRegistry([price, price])).toThrow();
    expect(() => parseAiTokenPricingRegistry([{ ...price, apiKey: 'private' }])).toThrow();
  });
  it('calculates consumed usage on validation failures without requiring success', () => {
    expect(
      estimateAiCallCost(
        {
          ...measurement,
          success: false,
          errorCategory: 'VALIDATION_FAILURE',
          validationResult: 'FAILED',
        },
        [price],
      ).totalCostUsdMicros,
    ).toBe(2880);
  });
});
