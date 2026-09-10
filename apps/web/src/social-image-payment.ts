export type SocialImagePayment =
  | { mode: 'SERVICE_PLAN'; canCreate: boolean; remaining: number }
  | { mode: 'PILOT'; canCreate: boolean; remaining: number }
  | { mode: 'SERVICE_CREDIT'; canCreate: boolean; remaining: number }
  | { mode: 'POINTS'; canCreate: boolean; availablePoints: number; pointCost: number | null };

export function resolveSocialImageExecutionPayment(input: {
  pilotPayment: boolean;
  pointPayment: boolean;
  badgePayment: boolean;
  serviceCreditPayment: boolean;
  planPayment: boolean;
}) {
  const directPaymentCount = [
    input.pilotPayment,
    input.pointPayment,
    input.badgePayment,
    input.serviceCreditPayment,
  ].filter(Boolean).length;
  const paymentCount = directPaymentCount + Number(input.planPayment);
  return {
    shouldReserveServiceMedia: directPaymentCount === 0,
    errorCode:
      paymentCount === 1
        ? null
        : paymentCount > 1
          ? 'SOCIAL_IMAGE_MULTIPLE_PAYMENTS_FOUND'
          : 'SOCIAL_IMAGE_PAYMENT_UNAVAILABLE',
  } as const;
}

export function resolveSocialImagePayment(input: {
  servicePlanRemaining: number | null;
  pilotRemaining: number | null;
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
  if (input.pilotRemaining !== null) {
    return {
      mode: 'PILOT',
      canCreate: input.pilotRemaining >= 1,
      remaining: input.pilotRemaining,
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
