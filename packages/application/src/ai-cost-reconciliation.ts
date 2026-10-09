import { ApplicationError } from '@bunshin/shared';
import {
  estimateAiCallCost,
  type AiCallCost,
  type AiCallMeasurement,
} from './ai-call-observability';

export const AI_COST_RECONCILIATION_VERSION = 'AI_COST_RECONCILIATION_V1';
/** Explicit, body-free projections. Callers must authorize repository reads separately. */
export interface AiUsageCostObservation {
  readonly id: string;
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly bunshinId: string | null;
  readonly usageKey: string;
  readonly taskType: string;
  readonly provider: string;
  readonly model: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly status: 'SUCCESS' | 'FAILED';
  readonly estimatedCostUsdMicros: number | null;
  readonly pricingVersion: string | null;
}
export interface PilotAiCostObservation {
  readonly id: string;
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly groupId: string;
  readonly programEnrollmentId: string;
  readonly usageKey: string;
  readonly measurement: AiCallMeasurement;
  readonly cost: AiCallCost;
}
function invalid(): never {
  throw new ApplicationError('VALIDATION_ERROR', 'invalid AI cost projection');
}
const symbol = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value);
const amount = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function keys(value: object, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid();
}
function pilotCost(row: PilotAiCostObservation) {
  keys(row.cost, [
    'costStatus',
    'inputCostUsdMicros',
    'outputCostUsdMicros',
    'totalCostUsdMicros',
    'pricing',
  ]);
  const computed = estimateAiCallCost(row.measurement, row.cost.pricing ? [row.cost.pricing] : []);
  if (
    computed.costStatus !== row.cost.costStatus ||
    computed.inputCostUsdMicros !== row.cost.inputCostUsdMicros ||
    computed.outputCostUsdMicros !== row.cost.outputCostUsdMicros ||
    computed.totalCostUsdMicros !== row.cost.totalCostUsdMicros ||
    (row.cost.pricing !== null && computed.pricing === null)
  )
    invalid();
  return computed;
}
/** Recorded-attempt coverage, never an invoice or proof of all actual Provider calls. */
export function reconcileAiCosts(input: {
  readonly scope: { readonly workspaceId: string; readonly actorUserId: string };
  readonly usage: readonly AiUsageCostObservation[];
  readonly pilot: readonly PilotAiCostObservation[];
  readonly readsComplete: boolean;
}) {
  keys(input, ['scope', 'usage', 'pilot', 'readsComplete']);
  keys(input.scope, ['workspaceId', 'actorUserId']);
  if (
    !symbol(input.scope.workspaceId) ||
    !symbol(input.scope.actorUserId) ||
    !Array.isArray(input.usage) ||
    !Array.isArray(input.pilot) ||
    input.usage.length + input.pilot.length > 10_000 ||
    typeof input.readsComplete !== 'boolean'
  )
    invalid();
  const rows = new Map<
    string,
    { usage: AiUsageCostObservation[]; pilot: PilotAiCostObservation[] }
  >();
  const ids = new Map<string, string>();
  for (const row of [...input.usage, ...input.pilot]) {
    if (!symbol(row.id) || !symbol(row.usageKey)) invalid();
    if (row.workspaceId !== input.scope.workspaceId || row.actorUserId !== input.scope.actorUserId)
      throw new ApplicationError('NOT_FOUND', 'AI cost scope unavailable');
    if (!rows.has(row.usageKey)) rows.set(row.usageKey, { usage: [], pilot: [] });
  }
  for (const row of input.usage) {
    const id = `usage:${row.id}`;
    if (ids.has(id) && ids.get(id) !== row.usageKey) invalid();
    ids.set(id, row.usageKey);
    keys(row, [
      'id',
      'workspaceId',
      'actorUserId',
      'bunshinId',
      'usageKey',
      'taskType',
      'provider',
      'model',
      'inputTokens',
      'outputTokens',
      'status',
      'estimatedCostUsdMicros',
      'pricingVersion',
    ]);
    if (
      ![row.taskType, row.provider, row.model].every(symbol) ||
      (row.bunshinId !== null && !symbol(row.bunshinId)) ||
      !['SUCCESS', 'FAILED'].includes(row.status) ||
      [row.inputTokens, row.outputTokens, row.estimatedCostUsdMicros].some(
        (n) => n !== null && !amount(n),
      ) ||
      (row.pricingVersion !== null && !symbol(row.pricingVersion))
    )
      invalid();
    rows.get(row.usageKey)!.usage.push(row);
  }
  for (const row of input.pilot) {
    const id = `pilot:${row.id}`;
    if (ids.has(id) && ids.get(id) !== row.usageKey) invalid();
    ids.set(id, row.usageKey);
    keys(row, [
      'id',
      'workspaceId',
      'actorUserId',
      'groupId',
      'programEnrollmentId',
      'usageKey',
      'measurement',
      'cost',
    ]);
    if (
      !symbol(row.groupId) ||
      !symbol(row.programEnrollmentId) ||
      !/^training-evaluation:[0-9a-f-]{36}:[0-9a-f-]{36}:attempt:[1-9][0-9]*$/i.test(row.usageKey)
    )
      invalid();
    pilotCost(row);
    rows.get(row.usageKey)!.pilot.push(row);
  }
  const attempts = [...rows]
    .sort(([a], [b]) => order(a, b))
    .map(([usageKey, source]) => {
      source.usage.sort((a, b) => order(a.id, b.id));
      source.pilot.sort((a, b) => order(a.id, b.id));
      // Same id and same observation can occur twice in a paged input. Conflicting duplicates never win.
      const u = source.usage[0];
      const p = source.pilot[0];
      let conflict = source.usage.some(
        (r) =>
          !u ||
          Object.keys(u).some(
            (k) => r[k as keyof AiUsageCostObservation] !== u[k as keyof AiUsageCostObservation],
          ),
      );
      conflict ||= source.pilot.some(
        (r) =>
          !p ||
          r.id !== p.id ||
          r.groupId !== p.groupId ||
          r.programEnrollmentId !== p.programEnrollmentId ||
          JSON.stringify(Object.entries(pilotCost(r).pricing ?? {}).sort()) !==
            JSON.stringify(Object.entries(pilotCost(p).pricing ?? {}).sort()) ||
          r.cost.totalCostUsdMicros !== p.cost.totalCostUsdMicros ||
          Object.keys(p.measurement).some(
            (k) =>
              r.measurement[k as keyof AiCallMeasurement] !==
              p.measurement[k as keyof AiCallMeasurement],
          ),
      );
      if (u && p) {
        conflict ||=
          u.taskType !== 'AI_TRAINING_ANSWER_EVALUATION' ||
          u.bunshinId !== null ||
          u.provider !== p.measurement.provider ||
          u.model !== p.measurement.model ||
          (u.inputTokens !== null &&
            p.measurement.inputTokens !== null &&
            u.inputTokens !== p.measurement.inputTokens) ||
          (u.outputTokens !== null &&
            p.measurement.outputTokens !== null &&
            u.outputTokens !== p.measurement.outputTokens) ||
          (u.estimatedCostUsdMicros !== null &&
            p.cost.totalCostUsdMicros !== null &&
            u.estimatedCostUsdMicros !== p.cost.totalCostUsdMicros) ||
          (u.pricingVersion !== null &&
            p.cost.pricing !== null &&
            u.pricingVersion !== p.cost.pricing.pricingVersion);
      }
      const cost = p
        ? p.cost.totalCostUsdMicros
        : u?.pricingVersion
          ? u.estimatedCostUsdMicros
          : null;
      return Object.freeze({
        usageKey,
        usageEventId: u?.id ?? null,
        pilotEventId: p?.id ?? null,
        bunshinId: conflict ? null : (u?.bunshinId ?? null),
        taskType: conflict ? null : p ? 'AI_TRAINING_ANSWER_EVALUATION' : (u?.taskType ?? null),
        status: conflict
          ? ('CONFLICT' as const)
          : cost === null
            ? ('UNKNOWN' as const)
            : ('ESTIMATED' as const),
        costSource: p ? ('PILOT_SNAPSHOT' as const) : ('AI_USAGE_RECORDED' as const),
        estimatedCostUsdMicros: conflict ? null : cost,
        pricingVersion: conflict
          ? null
          : p
            ? (p.cost.pricing?.pricingVersion ?? null)
            : (u?.pricingVersion ?? null),
        cachedInputTokens: conflict ? null : (p?.measurement.cachedInputTokens ?? null),
        usageOutcome: conflict ? null : (u?.status ?? null),
        pilotOutcome:
          !conflict && p
            ? p.measurement.success
              ? ('SUCCESS' as const)
              : ('FAILED' as const)
            : null,
        groupId: conflict ? null : (p?.groupId ?? null),
        programEnrollmentId: conflict ? null : (p?.programEnrollmentId ?? null),
        // Group context is not proof of OEM billing responsibility.
        oemAllocation: 'UNKNOWN' as const,
      });
    });
  const known = attempts.filter((a) => a.status === 'ESTIMATED');
  const subtotal = known.reduce((n, a) => n + BigInt(a.estimatedCostUsdMicros!), 0n);
  const safe = subtotal <= BigInt(Number.MAX_SAFE_INTEGER);
  const complete = input.readsComplete && known.length === attempts.length && safe;
  return Object.freeze({
    version: AI_COST_RECONCILIATION_VERSION,
    population: 'RECORDED_ATTEMPTS_ONLY' as const,
    actualCallCoverage: 'UNKNOWN' as const,
    attempts: Object.freeze(attempts),
    recordedAttemptCount: attempts.length,
    matchedAttemptCount: attempts.filter((a) => a.usageEventId && a.pilotEventId).length,
    estimatedAttemptCount: known.length,
    unknownAttemptCount: attempts.filter((a) => a.status === 'UNKNOWN').length,
    conflictAttemptCount: attempts.filter((a) => a.status === 'CONFLICT').length,
    recordedCostCoverage:
      input.readsComplete && attempts.length > 0 ? known.length / attempts.length : null,
    knownSubtotalUsdMicros: safe ? Number(subtotal) : null,
    recordedTotalUsdMicros: complete && attempts.length > 0 ? Number(subtotal) : null,
    readsComplete: input.readsComplete,
    incompleteReasons: Object.freeze([
      ...(!input.readsComplete ? ['PARTIAL_READ'] : []),
      ...(attempts.length === 0 ? ['EMPTY_POPULATION'] : []),
      ...(attempts.some((a) => a.status === 'UNKNOWN') ? ['COST_UNKNOWN'] : []),
      ...(attempts.some((a) => a.status === 'CONFLICT') ? ['LEDGER_CONFLICT'] : []),
      ...(!safe ? ['TOTAL_OVERFLOW'] : []),
    ]),
    billingUse: 'NOT_APPROVED' as const,
  });
}
