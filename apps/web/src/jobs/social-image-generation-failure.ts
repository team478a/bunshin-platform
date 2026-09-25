import {
  RefundBadgeEntitlementUsage,
  RefundPointRedemption,
  type SocialImageGenerationJobHandler,
} from '@bunshin/application';

type MarkFailedInput = Parameters<SocialImageGenerationJobHandler['markFailed']>[0];

export async function markSocialImageGenerationFailed(input: MarkFailedInput) {
  const db = await import('@bunshin/database');
  const failed = await new db.PrismaSocialImageGenerationExecutionRepository().markFailed(input);
  if (!failed) return;

  const redemptions = new db.PrismaPointRedemptionRepository();
  const redemption = await redemptions.findOwnedByResource({
    workspaceId: input.workspaceId,
    actorUserId: failed.ownerUserId,
    resourceType: 'SOCIAL_IMAGE_REQUEST',
    resourceId: input.requestId,
  });
  if (redemption?.status === 'CONFIRMED')
    await new RefundPointRedemption(redemptions).execute({
      workspaceId: input.workspaceId,
      actorUserId: failed.ownerUserId,
      redemptionId: redemption.id,
      reason: input.errorCode,
    });

  const badgeEntitlements = new db.PrismaBadgeEntitlementConsumptionRepository(db.prisma);
  const badgeUsage = await badgeEntitlements.findByResource({
    workspaceId: input.workspaceId,
    userId: failed.ownerUserId,
    resourceType: 'SOCIAL_IMAGE_REQUEST',
    resourceId: input.requestId,
  });
  if (badgeUsage?.status === 'CONSUMED')
    await new RefundBadgeEntitlementUsage(badgeEntitlements).execute({
      workspaceId: input.workspaceId,
      userId: failed.ownerUserId,
      usageId: badgeUsage.id,
      reason: input.errorCode,
    });
}
