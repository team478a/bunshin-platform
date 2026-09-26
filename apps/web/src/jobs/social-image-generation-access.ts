import {
  GetBadgeEntitlementUsageByResource,
  GetPointRedemptionByResource,
  GroupFeatureEntitlementService,
  SocialImageGenerationJobHandlerError,
  type ClaimSocialImageGenerationExecution,
} from '@bunshin/application';
import { reserveServiceMediaGeneration } from '../service-media-generation-quota';
import { resolveSocialImageExecutionPayment } from '../social-image-payment';

type SocialImageGenerationContext = Awaited<
  ReturnType<ClaimSocialImageGenerationExecution['execute']>
>;

const tokyoLocalDate = (value: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);

export async function authorizeSocialImageGeneration(context: SocialImageGenerationContext) {
  const db = await import('@bunshin/database');
  const redemption = await new GetPointRedemptionByResource(
    new db.PrismaPointRedemptionRepository(),
  )
    .execute({
      workspaceId: context.workspaceId,
      actorUserId: context.ownerUserId,
      resourceType: 'SOCIAL_IMAGE_REQUEST',
      resourceId: context.requestId,
    })
    .catch(() => null);
  const badgeEntitlements = new db.PrismaBadgeEntitlementConsumptionRepository(db.prisma);
  const badgeUsage = await new GetBadgeEntitlementUsageByResource(badgeEntitlements).execute({
    workspaceId: context.workspaceId,
    userId: context.ownerUserId,
    resourceType: 'SOCIAL_IMAGE_REQUEST',
    resourceId: context.requestId,
  });
  const pointPayment = redemption?.status === 'CONFIRMED';
  const badgePayment = badgeUsage?.status === 'CONSUMED';
  const pilotPayment = context.pilotEnrollmentId !== null;
  const serviceCreditPayment = Boolean(
    await db.prisma.serviceCreditLedger.findFirst({
      where: {
        workspaceId: context.workspaceId,
        groupId: context.groupId,
        userId: context.ownerUserId,
        type: 'CONSUME',
        sourceId: context.requestId,
        account: {
          workspaceId: context.workspaceId,
          groupId: context.groupId,
          userId: context.ownerUserId,
        },
      },
      select: { id: true },
    }),
  );
  const paymentBeforePlan = resolveSocialImageExecutionPayment({
    pilotPayment,
    pointPayment,
    badgePayment,
    serviceCreditPayment,
    planPayment: false,
  });
  const serviceMediaReservation = !paymentBeforePlan.shouldReserveServiceMedia
    ? ({ status: 'NOT_CONFIGURED', id: null } as const)
    : await reserveServiceMediaGeneration({
        workspaceId: context.workspaceId,
        groupId: context.groupId,
        kind: 'IMAGE',
        operationKey: context.idempotencyKey,
      });
  if (serviceMediaReservation.status === 'EXHAUSTED')
    throw new SocialImageGenerationJobHandlerError('SOCIAL_IMAGE_SERVICE_LIMIT_REACHED', false);
  if (serviceMediaReservation.status === 'ALREADY_CONSUMED')
    throw new SocialImageGenerationJobHandlerError('SOCIAL_IMAGE_SERVICE_USAGE_CONFLICT', false);
  const planPayment = ['RESERVED', 'ALREADY_RESERVED'].includes(serviceMediaReservation.status);
  const payment = resolveSocialImageExecutionPayment({
    pilotPayment,
    pointPayment,
    badgePayment,
    serviceCreditPayment,
    planPayment,
  });
  if (payment.errorCode) throw new SocialImageGenerationJobHandlerError(payment.errorCode, false);

  const now = new Date();
  const access = await new GroupFeatureEntitlementService(
    new db.PrismaGroupFeatureEntitlementRepository(),
  ).consumeAccess({
    workspaceId: context.workspaceId,
    groupId: context.groupId,
    actorUserId: context.ownerUserId,
    featureKey: 'SOCIAL.IMAGE_GENERATION',
    operationKey: `social-image:${context.requestId}`,
    localDate: tokyoLocalDate(now),
    now,
  });
  if (!access.allowed)
    throw new SocialImageGenerationJobHandlerError(`SOCIAL_IMAGE_${access.reason}`, false);

  return { serviceMediaReservation, planPayment };
}
