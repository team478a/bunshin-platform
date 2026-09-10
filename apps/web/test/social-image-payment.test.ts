import { describe, expect, it } from 'vitest';
import { resolveSocialImagePayment } from '../src/social-image-payment';

describe('social image payment display', () => {
  it('uses a service plan before an empty personal credit account', () => {
    expect(
      resolveSocialImagePayment({
        servicePlanRemaining: 10,
        pilotRemaining: 1,
        imageCreditAvailable: 0,
        pointCost: 50,
        availablePoints: 0,
      }),
    ).toEqual({ mode: 'SERVICE_PLAN', canCreate: true, remaining: 10 });
  });

  it('stops at an exhausted configured service plan instead of showing another payment source', () => {
    expect(
      resolveSocialImagePayment({
        servicePlanRemaining: 0,
        pilotRemaining: 1,
        imageCreditAvailable: 2,
        pointCost: 50,
        availablePoints: 100,
      }),
    ).toEqual({ mode: 'SERVICE_PLAN', canCreate: false, remaining: 0 });
  });

  it('uses an approved pilot generation before personal balances', () => {
    expect(
      resolveSocialImagePayment({
        servicePlanRemaining: null,
        pilotRemaining: 1,
        imageCreditAvailable: 0,
        pointCost: 50,
        availablePoints: 0,
      }),
    ).toEqual({ mode: 'PILOT', canCreate: true, remaining: 1 });
  });

  it('falls back to credits and then points when no organization allowance is configured', () => {
    expect(
      resolveSocialImagePayment({
        servicePlanRemaining: null,
        pilotRemaining: null,
        imageCreditAvailable: 1,
        pointCost: 50,
        availablePoints: 0,
      }),
    ).toEqual({ mode: 'SERVICE_CREDIT', canCreate: true, remaining: 1 });
    expect(
      resolveSocialImagePayment({
        servicePlanRemaining: null,
        pilotRemaining: null,
        imageCreditAvailable: null,
        pointCost: 50,
        availablePoints: 50,
      }),
    ).toEqual({ mode: 'POINTS', canCreate: true, pointCost: 50, availablePoints: 50 });
  });
});
