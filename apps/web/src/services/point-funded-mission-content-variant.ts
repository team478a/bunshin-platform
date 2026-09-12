import 'server-only';
import {
  ConfirmPointRedemption,
  ListPointRewardCatalog,
  ReleasePointRedemption,
  ReservePointReward,
  type PointRedemptionRepository,
} from '@bunshin/application';
import type { MissionContentVariant } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';

export const MISSION_CONTENT_VARIANT_REDEMPTION_RESOURCE = 'MISSION_CONTENT_VARIANT_GENERATION';

export interface PointFundedMissionContentVariantInput {
  workspaceId: string;
  groupId?: string | null;
  bunshinId: string;
  actorUserId: string;
  dailyMissionId: string;
  generationIdempotencyKey: string;
  usageIdempotencyPrefix: string;
  acceptedPointCost: number;
  serviceSafeMode?: boolean;
  allowServiceOwnerMemories?: boolean;
  variantInstructions?: string[];
}

interface Dependencies {
  redemptions: PointRedemptionRepository;
  generate(
    input: Omit<PointFundedMissionContentVariantInput, 'acceptedPointCost'>,
  ): Promise<MissionContentVariant>;
}

const redemptionResourceId = (input: PointFundedMissionContentVariantInput) =>
  `${input.dailyMissionId}:${input.generationIdempotencyKey}`;

export async function executePointFundedMissionContentVariant(
  input: PointFundedMissionContentVariantInput,
  dependencies: Dependencies,
) {
  const catalog = await new ListPointRewardCatalog(dependencies.redemptions).execute({
    workspaceId: input.workspaceId,
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
    actorUserId: input.actorUserId,
  });
  const reward = catalog.find(({ rewardType }) => rewardType === 'ALTERNATIVE_PLAN_GENERATION');
  if (!reward)
    throw new ApplicationError('CONFIGURATION_ERROR', 'variant point reward is unavailable');
  if (reward.pointCost !== input.acceptedPointCost)
    throw new ApplicationError('CONFLICT', 'variant point cost changed', {
      currentPointCost: reward.pointCost,
    });

  const reservation = await new ReservePointReward(dependencies.redemptions).execute({
    workspaceId: input.workspaceId,
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
    actorUserId: input.actorUserId,
    catalogItemId: reward.id,
    expectedPointCost: reward.pointCost,
    idempotencyKey: `mission-content-variant:${input.generationIdempotencyKey}`,
    resourceType: MISSION_CONTENT_VARIANT_REDEMPTION_RESOURCE,
    resourceId: redemptionResourceId(input),
    reservationMinutes: 60,
  });
  if (reservation.status === 'RELEASED' || reservation.status === 'REFUNDED')
    throw new ApplicationError('CONFLICT', 'variant point reservation is no longer usable');

  let generationCompleted = false;
  try {
    const variant = await dependencies.generate({
      workspaceId: input.workspaceId,
      ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
      bunshinId: input.bunshinId,
      actorUserId: input.actorUserId,
      dailyMissionId: input.dailyMissionId,
      generationIdempotencyKey: input.generationIdempotencyKey,
      usageIdempotencyPrefix: input.usageIdempotencyPrefix,
      ...(input.serviceSafeMode === undefined ? {} : { serviceSafeMode: input.serviceSafeMode }),
      ...(input.allowServiceOwnerMemories === undefined
        ? {}
        : { allowServiceOwnerMemories: input.allowServiceOwnerMemories }),
      ...(input.variantInstructions === undefined
        ? {}
        : { variantInstructions: input.variantInstructions }),
    });
    generationCompleted = true;
    if (reservation.status === 'RESERVED')
      await new ConfirmPointRedemption(dependencies.redemptions).execute({
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        redemptionId: reservation.id,
      });
    return variant;
  } catch (error) {
    if (!generationCompleted && reservation.status === 'RESERVED')
      await new ReleasePointRedemption(dependencies.redemptions)
        .execute({
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          redemptionId: reservation.id,
          reason: 'MISSION_CONTENT_VARIANT_GENERATION_FAILED',
        })
        .catch(() => undefined);
    throw error;
  }
}

export async function generatePointFundedMissionContentVariant(
  input: PointFundedMissionContentVariantInput,
) {
  const [{ createMissionContentVariantGenerationService }, db] = await Promise.all([
    import('./mission-content-variant-generation'),
    import('@bunshin/database'),
  ]);
  return executePointFundedMissionContentVariant(input, {
    redemptions: new db.PrismaPointRedemptionRepository(),
    generate: (generationInput) =>
      createMissionContentVariantGenerationService().execute(generationInput),
  });
}
