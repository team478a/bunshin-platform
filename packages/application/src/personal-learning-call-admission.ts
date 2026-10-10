import { parseAiTokenPricingRegistry, type AiTokenPricing } from './ai-call-observability';

/** Explicit server configuration. No permissive fallback or provider credentials. */
export type PersonalLearningCallAdmissionPolicy = Readonly<{
  workspaceId: string;
  groupId: string;
  serviceProgramId: string;
  dailyAttemptLimit: number;
  maxConcurrent: number;
  model: string;
  maxRequestBytes: number;
  maxOutputTokens: number;
  dailyCostLimitUsdMicros: number;
}>;

export function parsePersonalLearningCallAdmissionPolicy(
  value: unknown,
): PersonalLearningCallAdmissionPolicy | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = [
    'workspaceId',
    'groupId',
    'serviceProgramId',
    'dailyAttemptLimit',
    'maxConcurrent',
    'model',
    'maxRequestBytes',
    'maxOutputTokens',
    'dailyCostLimitUsdMicros',
  ];
  if (Object.keys(v).length !== keys.length || keys.some((key) => !Object.hasOwn(v, key)))
    return null;
  for (const key of ['workspaceId', 'groupId', 'serviceProgramId']) {
    if (
      typeof v[key] !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v[key])
    )
      return null;
  }
  for (const key of [
    'dailyAttemptLimit',
    'maxConcurrent',
    'maxRequestBytes',
    'maxOutputTokens',
    'dailyCostLimitUsdMicros',
  ]) {
    const n = v[key];
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1) return null;
  }
  if (
    Number(v.dailyAttemptLimit) > 2_147_483_647 ||
    Number(v.maxConcurrent) > 2_147_483_647 ||
    Number(v.maxRequestBytes) > 2_147_483_647 ||
    Number(v.maxOutputTokens) > 2_147_483_647 ||
    Number(v.maxConcurrent) > Number(v.dailyAttemptLimit) ||
    Number(v.maxOutputTokens) < 16 ||
    typeof v.model !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(v.model)
  )
    return null;
  return Object.freeze({ ...v }) as PersonalLearningCallAdmissionPolicy;
}

export type PersonalLearningCallCostReservation = Readonly<{
  reservedCostUsdMicros: number;
  pricingVersion: string;
}>;

/**
 * Reserves a conservative maximum before the provider request. UTF-8 request bytes are used as
 * the input-token ceiling (a token cannot encode fewer than one byte), and cached discounts are
 * intentionally ignored. Missing, free, ambiguous, future or overflowing prices fail closed.
 */
export function reservePersonalLearningCallCost(input: {
  policy: PersonalLearningCallAdmissionPolicy;
  provider: string;
  pricingRegistry: readonly AiTokenPricing[];
  occurredAt: Date;
}): PersonalLearningCallCostReservation | null {
  const policy = parsePersonalLearningCallAdmissionPolicy(input.policy);
  if (!policy || !Number.isFinite(input.occurredAt.getTime())) return null;
  let registry: readonly AiTokenPricing[];
  try {
    registry = parseAiTokenPricingRegistry(input.pricingRegistry);
  } catch {
    return null;
  }
  const pricing = registry
    .filter(
      (candidate) =>
        candidate.provider === input.provider &&
        candidate.model === policy.model &&
        Date.parse(candidate.effectiveFrom) <= input.occurredAt.getTime(),
    )
    .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0];
  if (
    !pricing ||
    pricing.inputPriceMicrosPerMillion <= 0 ||
    pricing.outputPriceMicrosPerMillion <= 0
  )
    return null;
  const ceilMillion = (value: bigint) => (value + 999_999n) / 1_000_000n;
  const reserved =
    ceilMillion(BigInt(policy.maxRequestBytes) * BigInt(pricing.inputPriceMicrosPerMillion)) +
    ceilMillion(BigInt(policy.maxOutputTokens) * BigInt(pricing.outputPriceMicrosPerMillion));
  if (reserved < 1n || reserved > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Object.freeze({
    reservedCostUsdMicros: Number(reserved),
    pricingVersion: pricing.pricingVersion,
  });
}
