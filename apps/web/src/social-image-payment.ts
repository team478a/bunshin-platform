export type SocialImagePayment =
  | { mode: 'SERVICE_PLAN'; canCreate: boolean; remaining: number }
  | { mode: 'SERVICE_CREDIT'; canCreate: boolean; remaining: number }
  | { mode: 'POINTS'; canCreate: boolean; availablePoints: number; pointCost: number | null };

export function resolveSocialImagePayment(input: {
  servicePlanRemaining: number | null;
  imageCreditAvailable: number | null;
  pointCost: number | null;
  availablePoints: number;
}): SocialImagePayment {
  if (input.servicePlanRemaining !== null) {
    return {
      mode: 'SERVICE_PLAN',
      canCreate: input.servicePlanRemaining >= 1,
      remaining: input.servicePlanRemaining,
    };
  }
  if (input.imageCreditAvailable !== null) {
    return {
      mode: 'SERVICE_CREDIT',
      canCreate: input.imageCreditAvailable >= 1,
      remaining: input.imageCreditAvailable,
    };
  }
  return {
    mode: 'POINTS',
    canCreate: input.pointCost !== null && input.availablePoints >= input.pointCost,
    availablePoints: input.availablePoints,
    pointCost: input.pointCost,
  };
}
