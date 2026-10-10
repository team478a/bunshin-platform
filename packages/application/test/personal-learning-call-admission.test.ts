import { describe, expect, it } from 'vitest';
import {
  parsePersonalLearningCallAdmissionPolicy,
  reservePersonalLearningCallCost,
} from '../src/personal-learning-call-admission';
const policy = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  groupId: '00000000-0000-4000-8000-000000000002',
  serviceProgramId: '00000000-0000-4000-8000-000000000003',
  model: 'synthetic',
  dailyAttemptLimit: 2,
  maxConcurrent: 1,
  maxRequestBytes: 10000,
  maxOutputTokens: 100,
  dailyCostLimitUsdMicros: 1000,
};
describe('Pilot admission policy', () => {
  it('accepts only an explicit immutable policy', () => {
    const parsed = parsePersonalLearningCallAdmissionPolicy(policy);
    expect(parsed).toEqual(policy);
    expect(Object.isFrozen(parsed)).toBe(true);
  });
  it.each([
    null,
    {},
    [],
    { ...policy, extra: true },
    { ...policy, dailyAttemptLimit: 0 },
    { ...policy, maxConcurrent: 3 },
    { ...policy, maxOutputTokens: 15 },
    { ...policy, maxRequestBytes: NaN },
    { ...policy, dailyCostLimitUsdMicros: 0 },
    { ...policy, model: ' secret ' },
    { ...policy, workspaceId: 'other' },
  ])('fails closed for invalid configuration', (input) => {
    expect(parsePersonalLearningCallAdmissionPolicy(input)).toBeNull();
  });
  it('reserves the conservative request ceiling with the current exact price', () => {
    expect(
      reservePersonalLearningCallCost({
        policy,
        provider: 'openai',
        occurredAt: new Date('2026-10-10T00:00:00Z'),
        pricingRegistry: [
          {
            provider: 'openai',
            model: 'synthetic',
            effectiveFrom: '2026-10-01T00:00:00Z',
            inputPriceMicrosPerMillion: 2_000_000,
            outputPriceMicrosPerMillion: 8_000_000,
            cachedInputPriceMicrosPerMillion: 200_000,
            currency: 'USD',
            pricingVersion: 'synthetic-v1',
          },
        ],
      }),
    ).toEqual({ reservedCostUsdMicros: 20_800, pricingVersion: 'synthetic-v1' });
  });
  it('fails closed for missing, future, free or mismatched prices', () => {
    const base = {
      policy,
      provider: 'openai',
      occurredAt: new Date('2026-10-10T00:00:00Z'),
    };
    const price = {
      provider: 'openai',
      model: 'synthetic',
      effectiveFrom: '2026-10-01T00:00:00Z',
      inputPriceMicrosPerMillion: 1,
      outputPriceMicrosPerMillion: 1,
      cachedInputPriceMicrosPerMillion: null,
      currency: 'USD' as const,
      pricingVersion: 'synthetic-v1',
    };
    expect(reservePersonalLearningCallCost({ ...base, pricingRegistry: [] })).toBeNull();
    expect(
      reservePersonalLearningCallCost({
        ...base,
        pricingRegistry: [{ ...price, effectiveFrom: '2026-10-11T00:00:00Z' }],
      }),
    ).toBeNull();
    expect(
      reservePersonalLearningCallCost({
        ...base,
        pricingRegistry: [{ ...price, inputPriceMicrosPerMillion: 0 }],
      }),
    ).toBeNull();
    expect(
      reservePersonalLearningCallCost({
        ...base,
        pricingRegistry: [{ ...price, model: 'other' }],
      }),
    ).toBeNull();
  });
});
