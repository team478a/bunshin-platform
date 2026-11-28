import { ApplicationError } from '@bunshin/shared';

export const AI_CALL_OBSERVABILITY_VERSION = 'AI_CALL_OBSERVABILITY_V1';
export interface AiCallMeasurement {
  readonly provider: string;
  readonly model: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly latencyMs: number;
  readonly success: boolean;
  readonly errorCategory:
    | 'TIMEOUT'
    | 'PROVIDER_ERROR'
    | 'RATE_LIMIT'
    | 'INVALID_RESPONSE'
    | 'VALIDATION_FAILURE'
    | 'UNKNOWN'
    | null;
  readonly validationResult: 'PASSED' | 'FAILED' | 'NOT_RUN';
  readonly fallbackUsed: boolean;
  readonly occurredAt: string;
}
export interface AiTokenPricing {
  readonly provider: string;
  readonly model: string;
  readonly effectiveFrom: string;
  readonly inputPriceMicrosPerMillion: number;
  readonly outputPriceMicrosPerMillion: number;
  readonly cachedInputPriceMicrosPerMillion: number | null;
  readonly currency: 'USD';
  readonly pricingVersion: string;
}
export interface AiCallCost {
  readonly costStatus: 'ESTIMATED' | 'UNKNOWN';
  readonly inputCostUsdMicros: number | null;
  readonly outputCostUsdMicros: number | null;
  readonly totalCostUsdMicros: number | null;
  readonly pricing: AiTokenPricing | null;
}
const symbol = (v: unknown) =>
  typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(v);
const count = (v: unknown) =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 2_147_483_647;
const instant = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
function invalid(): never {
  throw new ApplicationError('VALIDATION_ERROR', 'invalid AI call telemetry');
}
function strict(value: object, keys: readonly string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) invalid();
}
export function validateAiCallMeasurement(value: AiCallMeasurement): AiCallMeasurement {
  strict(value, [
    'provider',
    'model',
    'inputTokens',
    'outputTokens',
    'cachedInputTokens',
    'latencyMs',
    'success',
    'errorCategory',
    'validationResult',
    'fallbackUsed',
    'occurredAt',
  ]);
  if (
    !symbol(value.provider) ||
    !symbol(value.model) ||
    !instant(value.occurredAt) ||
    !count(value.latencyMs) ||
    [value.inputTokens, value.outputTokens, value.cachedInputTokens].some(
      (v) => v !== null && !count(v),
    ) ||
    (value.cachedInputTokens !== null &&
      (value.inputTokens === null || value.cachedInputTokens > value.inputTokens)) ||
    typeof value.success !== 'boolean' ||
    typeof value.fallbackUsed !== 'boolean' ||
    !['PASSED', 'FAILED', 'NOT_RUN'].includes(value.validationResult) ||
    ![
      null,
      'TIMEOUT',
      'PROVIDER_ERROR',
      'RATE_LIMIT',
      'INVALID_RESPONSE',
      'VALIDATION_FAILURE',
      'UNKNOWN',
    ].includes(value.errorCategory) ||
    (value.success && (value.errorCategory !== null || value.validationResult !== 'PASSED')) ||
    (!value.success && value.errorCategory === null)
  )
    invalid();
  return Object.freeze({ ...value });
}
export function parseAiTokenPricingRegistry(value: unknown): readonly AiTokenPricing[] {
  if (!Array.isArray(value) || value.length > 20) invalid();
  const keys = new Set<string>();
  return Object.freeze(
    value.map((raw: unknown) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
      strict(raw, [
        'provider',
        'model',
        'effectiveFrom',
        'inputPriceMicrosPerMillion',
        'outputPriceMicrosPerMillion',
        'cachedInputPriceMicrosPerMillion',
        'currency',
        'pricingVersion',
      ]);
      const p = raw as AiTokenPricing;
      if (
        !symbol(p.provider) ||
        !symbol(p.model) ||
        !symbol(p.pricingVersion) ||
        !instant(p.effectiveFrom) ||
        p.currency !== 'USD' ||
        [p.inputPriceMicrosPerMillion, p.outputPriceMicrosPerMillion].some(
          (n) => !Number.isSafeInteger(n) || n < 0,
        ) ||
        (p.cachedInputPriceMicrosPerMillion !== null &&
          (!Number.isSafeInteger(p.cachedInputPriceMicrosPerMillion) ||
            p.cachedInputPriceMicrosPerMillion < 0))
      )
        invalid();
      const key = `${p.provider}:${p.model}:${Date.parse(p.effectiveFrom)}`;
      if (keys.has(key)) invalid();
      keys.add(key);
      return Object.freeze({ ...p });
    }),
  );
}
export function estimateAiCallCost(
  measurement: AiCallMeasurement,
  registry: readonly AiTokenPricing[],
): AiCallCost {
  const m = validateAiCallMeasurement(measurement);
  const p =
    parseAiTokenPricingRegistry(registry)
      .filter(
        (r) =>
          r.provider === m.provider &&
          r.model === m.model &&
          Date.parse(r.effectiveFrom) <= Date.parse(m.occurredAt),
      )
      .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0] ?? null;
  const unknown = (): AiCallCost =>
    Object.freeze({
      costStatus: 'UNKNOWN',
      inputCostUsdMicros: null,
      outputCostUsdMicros: null,
      totalCostUsdMicros: null,
      pricing: p,
    });
  if (
    !p ||
    m.inputTokens === null ||
    m.outputTokens === null ||
    m.cachedInputTokens === null ||
    (m.cachedInputTokens !== null &&
      m.cachedInputTokens > 0 &&
      p.cachedInputPriceMicrosPerMillion === null)
  )
    return unknown();
  const cost = calculateTokenCost(m.inputTokens, m.outputTokens, m.cachedInputTokens, p);
  if (!cost) return unknown();
  return Object.freeze({
    costStatus: 'ESTIMATED',
    ...cost,
    pricing: p,
  });
}

function calculateTokenCost(
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens: number,
  price: Pick<
    AiTokenPricing,
    | 'inputPriceMicrosPerMillion'
    | 'outputPriceMicrosPerMillion'
    | 'cachedInputPriceMicrosPerMillion'
  >,
) {
  const ceil = (n: bigint) => Number((n + 999_999n) / 1_000_000n);
  const input = ceil(
    BigInt(inputTokens - cachedInputTokens) * BigInt(price.inputPriceMicrosPerMillion) +
      BigInt(cachedInputTokens) * BigInt(price.cachedInputPriceMicrosPerMillion ?? 0),
  );
  const output = ceil(BigInt(outputTokens) * BigInt(price.outputPriceMicrosPerMillion));
  if (![input, output, input + output].every(Number.isSafeInteger)) return null;
  return {
    inputCostUsdMicros: input,
    outputCostUsdMicros: output,
    totalCostUsdMicros: input + output,
  };
}

/** Standard text rates for the existing OpenAI runtime models. AiUsageEvent has no cache counts. */
const openAiStandardPrices = [
  {
    models: ['gpt-5-mini', 'gpt-5-mini-2025-08-07'],
    effectiveFrom: '2025-08-07T00:00:00Z',
    pricingVersion: 'openai-gpt-5-mini-standard-2025-08-07',
    inputPriceMicrosPerMillion: 250_000,
    outputPriceMicrosPerMillion: 2_000_000,
  },
  {
    models: ['gpt-5.2', 'gpt-5.2-2025-12-11'],
    effectiveFrom: '2025-12-11T00:00:00Z',
    pricingVersion: 'openai-gpt-5.2-standard-2025-12-11',
    inputPriceMicrosPerMillion: 1_750_000,
    outputPriceMicrosPerMillion: 14_000_000,
  },
  {
    models: ['gpt-5.6-terra'],
    effectiveFrom: '2026-11-24T00:00:00Z',
    pricingVersion: 'openai-gpt-5.6-terra-standard-2026-11-24',
    inputPriceMicrosPerMillion: 2_000_000,
    outputPriceMicrosPerMillion: 12_000_000,
  },
];

export function estimateRecordedAiUsageCost(
  row: {
    provider: string;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    occurredAt: Date;
  },
  registry: readonly AiTokenPricing[],
): number | null {
  const { inputTokens, outputTokens } = row;
  if (inputTokens === null || outputTokens === null || !count(inputTokens) || !count(outputTokens))
    return null;

  const provider = row.provider.toLowerCase();
  const validOn = (price: { effectiveFrom: string }) =>
    Date.parse(price.effectiveFrom) <= row.occurredAt.getTime();
  const standard =
    provider === 'openai'
      ? openAiStandardPrices.find((price) => price.models.includes(row.model) && validOn(price))
      : undefined;
  const configured = registry
    .filter((price) => price.provider === provider && price.model === row.model && validOn(price))
    .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0];
  let price: AiTokenPricing;
  if (
    configured &&
    (!standard || Date.parse(configured.effectiveFrom) >= Date.parse(standard.effectiveFrom))
  ) {
    price = configured;
  } else if (standard) {
    const longTerraRequest = row.model === 'gpt-5.6-terra' && inputTokens > 272_000;
    price = {
      provider,
      model: row.model,
      currency: 'USD',
      effectiveFrom: standard.effectiveFrom,
      pricingVersion: standard.pricingVersion,
      cachedInputPriceMicrosPerMillion: null,
      inputPriceMicrosPerMillion: longTerraRequest
        ? 4_000_000
        : standard.inputPriceMicrosPerMillion,
      outputPriceMicrosPerMillion: longTerraRequest
        ? 18_000_000
        : standard.outputPriceMicrosPerMillion,
    };
  } else return null;

  return calculateTokenCost(inputTokens, outputTokens, 0, price)?.totalCostUsdMicros ?? null;
}
