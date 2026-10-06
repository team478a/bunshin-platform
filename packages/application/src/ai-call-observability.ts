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
  const cached = m.cachedInputTokens ?? 0;
  const ceil = (n: bigint) => Number((n + 999_999n) / 1_000_000n);
  const input = ceil(
    BigInt(m.inputTokens - cached) * BigInt(p.inputPriceMicrosPerMillion) +
      BigInt(cached) * BigInt(p.cachedInputPriceMicrosPerMillion ?? 0),
  );
  const output = ceil(BigInt(m.outputTokens) * BigInt(p.outputPriceMicrosPerMillion));
  if (![input, output, input + output].every(Number.isSafeInteger)) return unknown();
  return Object.freeze({
    costStatus: 'ESTIMATED',
    inputCostUsdMicros: input,
    outputCostUsdMicros: output,
    totalCostUsdMicros: input + output,
    pricing: p,
  });
}
