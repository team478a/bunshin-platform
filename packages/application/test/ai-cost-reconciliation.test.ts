import { describe, expect, it, vi } from 'vitest';
import {
  AI_COST_RECONCILIATION_VERSION,
  estimateAiCallCost,
  reconcileAiCosts,
  type AiCallMeasurement,
  type AiTokenPricing,
  type AiUsageCostObservation,
  type PilotAiCostObservation,
} from '../src';

const scope = { workspaceId: 'workspace-a', actorUserId: 'user-a' };
const key = (attempt: number) =>
  `training-evaluation:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:attempt:${attempt}`;
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
  occurredAt: '2026-10-09T00:00:00Z',
};
const pricing: AiTokenPricing = {
  provider: 'openai',
  model: 'synthetic',
  effectiveFrom: '2026-10-01T00:00:00Z',
  inputPriceMicrosPerMillion: 2_000_000,
  outputPriceMicrosPerMillion: 8_000_000,
  cachedInputPriceMicrosPerMillion: 200_000,
  currency: 'USD',
  pricingVersion: 'synthetic-v1',
};
function pilot(attempt = 1, change: Partial<AiCallMeasurement> = {}): PilotAiCostObservation {
  const m = { ...measurement, ...change };
  return {
    ...scope,
    id: `pilot-${attempt}`,
    groupId: 'service-a',
    programEnrollmentId: 'enrollment-a',
    usageKey: key(attempt),
    measurement: m,
    cost: estimateAiCallCost(m, [pricing]),
  };
}
function usage(attempt = 1): AiUsageCostObservation {
  return {
    ...scope,
    bunshinId: null,
    id: `usage-${attempt}`,
    usageKey: key(attempt),
    taskType: 'AI_TRAINING_ANSWER_EVALUATION',
    provider: 'openai',
    model: 'synthetic',
    inputTokens: 1000,
    outputTokens: 200,
    status: 'SUCCESS',
    estimatedCostUsdMicros: 2880,
    pricingVersion: 'synthetic-v1',
  };
}
const run = (
  u: readonly AiUsageCostObservation[] = [usage()],
  p: readonly PilotAiCostObservation[] = [pilot()],
  readsComplete = true,
) => reconcileAiCosts({ scope, usage: u, pilot: p, readsComplete });

describe('AI cost reconciliation', () => {
  it('counts the two existing ledgers as one attempt and one snapshot-priced cost', () => {
    const r = run();
    expect(r).toMatchObject({
      version: AI_COST_RECONCILIATION_VERSION,
      recordedAttemptCount: 1,
      matchedAttemptCount: 1,
      recordedTotalUsdMicros: 2880,
      recordedCostCoverage: 1,
      actualCallCoverage: 'UNKNOWN',
      billingUse: 'NOT_APPROVED',
    });
    expect(r.attempts[0]).toMatchObject({
      costSource: 'PILOT_SNAPSHOT',
      cachedInputTokens: 400,
      groupId: 'service-a',
      pricingVersion: 'synthetic-v1',
      oemAllocation: 'UNKNOWN',
    });
  });
  it('deduplicates repeated input records without mutating inputs', () => {
    const u = usage();
    const p = pilot();
    const before = JSON.stringify([u, p]);
    expect(run([u, u], [p, p])).toEqual(run([u], [p]));
    expect(JSON.stringify([u, p])).toBe(before);
    expect(Object.isFrozen(run().attempts[0])).toBe(true);
  });
  it('is independent of input order and JSON key order', () => {
    const p = pilot();
    const { pricingVersion, ...otherPriceFields } = pricing;
    const q = {
      ...p,
      cost: { ...p.cost, pricing: { pricingVersion, ...otherPriceFields } },
    };
    expect(run([usage(2), usage(1)], [pilot(2), p, q])).toEqual(
      run([usage(1), usage(2)], [p, pilot(2)]),
    );
  });
  it('keeps retry cost and failure outcomes separate, including validation-failed consumed tokens', () => {
    const p = pilot(1, {
      success: false,
      errorCategory: 'VALIDATION_FAILURE',
      validationResult: 'FAILED',
    });
    const r = run([{ ...usage(1), status: 'FAILED' }, usage(2)], [p, pilot(2)]);
    expect(r.recordedTotalUsdMicros).toBe(5760);
    expect(r.attempts[0]).toMatchObject({
      usageOutcome: 'FAILED',
      pilotOutcome: 'FAILED',
      status: 'ESTIMATED',
    });
  });
  it('does not confuse Provider success with downstream worker failure', () => {
    expect(run([{ ...usage(), status: 'FAILED' }]).attempts[0]).toMatchObject({
      usageOutcome: 'FAILED',
      pilotOutcome: 'SUCCESS',
      status: 'ESTIMATED',
    });
  });
  it.each([
    { cachedInputTokens: null },
    { outputTokens: null },
    { inputTokens: null, cachedInputTokens: null },
  ])('never fills missing Pilot usage from the general ledger: %o', (change) => {
    const r = run([usage()], [pilot(1, change)]);
    expect(r).toMatchObject({
      recordedTotalUsdMicros: null,
      knownSubtotalUsdMicros: 0,
      unknownAttemptCount: 1,
    });
    expect(r.attempts[0]?.estimatedCostUsdMicros).toBeNull();
  });
  it('keeps timeout/missing usage UNKNOWN, not a zero-cost failure', () => {
    const p = pilot(1, {
      success: false,
      errorCategory: 'TIMEOUT',
      validationResult: 'NOT_RUN',
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
    });
    expect(run([], [p]).recordedTotalUsdMicros).toBeNull();
  });
  it('recognizes explicit observed zero, but not a missing price version', () => {
    const p = pilot(1, { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 });
    expect(run([], [p]).recordedTotalUsdMicros).toBe(0);
    expect(
      run([{ ...usage(), estimatedCostUsdMicros: 0, pricingVersion: null }], [])
        .recordedTotalUsdMicros,
    ).toBeNull();
  });
  it('preserves unmatched sources and cannot infer historical Service/OEM from current membership', () => {
    const r = run([usage()], []);
    expect(r.attempts[0]).toMatchObject({
      costSource: 'AI_USAGE_RECORDED',
      groupId: null,
      programEnrollmentId: null,
      cachedInputTokens: null,
      oemAllocation: 'UNKNOWN',
    });
    expect(run([], [pilot()]).matchedAttemptCount).toBe(0);
  });
  it.each([
    { model: 'other' },
    { inputTokens: 1 },
    { outputTokens: 1 },
    { estimatedCostUsdMicros: 1 },
    { pricingVersion: 'different' },
    { taskType: 'SOCIAL_DAILY_MISSION' },
  ])(
    'refuses conflicting dual-ledger observations without choosing the cheaper amount: %o',
    (change) => {
      const r = run([{ ...usage(), ...change }]);
      expect(r).toMatchObject({ conflictAttemptCount: 1, recordedTotalUsdMicros: null });
      expect(r.attempts[0]).toMatchObject({
        status: 'CONFLICT',
        estimatedCostUsdMicros: null,
        groupId: null,
      });
    },
  );
  it('preserves one attempt as conflict when duplicate IDs or Service context disagree', () => {
    expect(run([usage(), { ...usage(), id: 'other' }]).conflictAttemptCount).toBe(1);
    expect(
      run([usage()], [pilot(), { ...pilot(), groupId: 'service-b' }]).conflictAttemptCount,
    ).toBe(1);
    expect(() => run([usage(), { ...usage(2), id: usage().id }], [])).toThrow();
    const a = usage();
    const b = { ...a, id: 'other', status: 'FAILED' as const };
    expect(run([a, b])).toEqual(run([b, a]));
  });
  it('does not merge different attempts even with the same time/model/cost', () => {
    expect(run([usage(1)], [pilot(2)]).recordedAttemptCount).toBe(2);
    expect(run([usage(1)], [pilot(2)]).matchedAttemptCount).toBe(0);
  });
  it('preserves historical snapshot pricing rather than a new registry or price version', () => {
    const p = pilot();
    const newPrice = {
      ...pricing,
      pricingVersion: 'synthetic-v2',
      inputPriceMicrosPerMillion: 9_000_000,
    };
    const p2 = { ...pilot(2), cost: estimateAiCallCost(measurement, [newPrice]) };
    const r = run([], [p, p2]);
    expect(r.attempts.map((a) => a.pricingVersion)).toEqual(['synthetic-v1', 'synthetic-v2']);
    expect(r.attempts[0]?.estimatedCostUsdMicros).toBe(2880);
  });
  it('rejects corrupted cost snapshot, future pricing and private/raw fields', () => {
    const p = pilot();
    expect(() => run([], [{ ...p, cost: { ...p.cost, totalCostUsdMicros: 0 } }])).toThrow();
    expect(() =>
      run(
        [],
        [
          {
            ...p,
            cost: { ...p.cost, pricing: { ...pricing, effectiveFrom: '2027-01-01T00:00:00Z' } },
          },
        ],
      ),
    ).toThrow();
    expect(() => run([{ ...usage(), answer: 'private' } as AiUsageCostObservation], [])).toThrow();
    expect(() =>
      run([], [{ ...p, measurement: { ...measurement, prompt: 'private' } as AiCallMeasurement }]),
    ).toThrow();
    expect(JSON.stringify(run())).not.toContain('private');
  });
  it.each([{ workspaceId: 'workspace-b' }, { actorUserId: 'user-b' }])(
    'rejects cross scope: %o',
    (change) => {
      expect(() => run([{ ...usage(), ...change }])).toThrow('AI cost scope unavailable');
      expect(() => run([], [{ ...pilot(), ...change }])).toThrow('AI cost scope unavailable');
    },
  );
  it('marks partial and empty populations unknown rather than complete/zero totals', () => {
    expect(run([usage()], [pilot()], false)).toMatchObject({
      recordedTotalUsdMicros: null,
      knownSubtotalUsdMicros: 2880,
      recordedCostCoverage: null,
    });
    expect(run([], [])).toMatchObject({
      recordedTotalUsdMicros: null,
      recordedCostCoverage: null,
      actualCallCoverage: 'UNKNOWN',
    });
  });
  it('does not silently overflow aggregate integer micro-USD', () => {
    const u = { ...usage(), estimatedCostUsdMicros: Number.MAX_SAFE_INTEGER };
    expect(run([u, { ...u, id: 'second', usageKey: key(2) }], [])).toMatchObject({
      recordedTotalUsdMicros: null,
      knownSubtotalUsdMicros: null,
    });
  });
  it('rejects invalid amounts, flags, oversized batches and unmatched Pilot key formats', () => {
    expect(() => run([{ ...usage(), estimatedCostUsdMicros: -1 }], [])).toThrow();
    expect(() => run([], [{ ...pilot(), usageKey: 'unknown' }])).toThrow();
    expect(() =>
      run(
        Array.from({ length: 10001 }, () => usage()),
        [],
      ),
    ).toThrow();
    expect(() =>
      reconcileAiCosts({
        scope,
        usage: [],
        pilot: [],
        readsComplete: undefined as unknown as boolean,
      }),
    ).toThrow();
  });
  it('preserves explicit Bunshin identity and rejects incompatible Pilot correlation', () => {
    const u = { ...usage(), bunshinId: 'bunshin-a' };
    expect(run([u], []).attempts[0]?.bunshinId).toBe('bunshin-a');
    expect(run([u]).conflictAttemptCount).toBe(1);
    expect(run([u, { ...u, bunshinId: 'bunshin-b' }], []).conflictAttemptCount).toBe(1);
  });
  it('does not invoke an external API and produces a JSON-serializable report', () => {
    const fetch = vi.fn(() => {
      throw new Error('external API forbidden');
    });
    vi.stubGlobal('fetch', fetch);
    try {
      const report = run();
      expect(JSON.parse(JSON.stringify(report))).toEqual(report);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
