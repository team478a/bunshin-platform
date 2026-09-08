import 'server-only';
import {
  CreateSocialImageGenerationRequest,
  EnqueueJob,
  SOCIAL_IMAGE_GENERATION_JOB_TYPE,
  TransitionSocialImageGenerationRequest,
  type JobEnvironment,
} from '@bunshin/application';
import { assertOrganizationGenerationQuota } from '../organization-generation-quota';
import {
  finishServiceMediaGeneration,
  reserveServiceMediaGeneration,
} from '../service-media-generation-quota';

export type AutomaticDailyImageResult =
  | { status: 'SKIPPED'; reason: string }
  | { status: 'QUEUED' | 'ALREADY_AVAILABLE'; requestId: string };

export function isAutomaticDailyImageEligible(input: {
  mediaMode: 'TEXT_ONLY' | 'IMAGE' | 'VIDEO' | 'IMAGE_AND_VIDEO';
  assistanceLevel: 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE';
  format: string;
  environment: JobEnvironment;
}) {
  return (
    (input.mediaMode === 'IMAGE' || input.mediaMode === 'IMAGE_AND_VIDEO') &&
    input.assistanceLevel === 'READY_TO_USE' &&
    ['IMAGE', 'SLIDE'].includes(input.format) &&
    input.environment === 'PRODUCTION'
  );
}

export async function queueAutomaticDailyImage(input: {
  environment: JobEnvironment;
  workspaceId: string;
  groupId: string;
  actorUserId: string;
  bunshinId: string;
  correlationId: string;
  mission: {
    id: string;
    assistanceLevel: 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE';
    format: string;
    topic: string;
    angle: string;
    campaignId?: string | null;
  };
  mediaMode: 'TEXT_ONLY' | 'IMAGE' | 'VIDEO' | 'IMAGE_AND_VIDEO';
}): Promise<AutomaticDailyImageResult> {
  if (
    !isAutomaticDailyImageEligible({
      mediaMode: input.mediaMode,
      assistanceLevel: input.mission.assistanceLevel,
      format: input.mission.format,
      environment: input.environment,
    })
  )
    return { status: 'SKIPPED', reason: 'NOT_ELIGIBLE' };

  const operationKey = `automatic-daily-image:${input.mission.id}`;
  let reservation: Awaited<ReturnType<typeof reserveServiceMediaGeneration>> | null = null;
  try {
    reservation = await reserveServiceMediaGeneration({
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      kind: 'IMAGE',
      operationKey,
    });
    if (!['RESERVED', 'ALREADY_RESERVED'].includes(reservation.status))
      return { status: 'SKIPPED', reason: `PLAN_${reservation.status}` };
    const db = await import('@bunshin/database');
    const [membership, mission, brand] = await Promise.all([
      db.prisma.groupMembership.findFirst({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          consentedAt: { not: null },
        },
        select: { id: true },
      }),
      db.prisma.dailyMission.findFirst({
        where: {
          id: input.mission.id,
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          bunshin: { groupId: input.groupId, ownerUserId: input.actorUserId },
        },
        select: {
          campaignId: true,
          contentLinkUsage: { select: { productPackVersionId: true } },
        },
      }),
      db.prisma.serviceBrand.findFirst({
        where: { workspaceId: input.workspaceId, groupId: input.groupId },
        select: { primaryColor: true },
      }),
    ]);
    if (!membership || !mission) throw new Error('automatic image scope is unavailable');
    await assertOrganizationGenerationQuota({ workspaceId: input.workspaceId, kind: 'IMAGE' });

    const requests = new db.PrismaSocialImageGenerationRequestRepository();
    let request = await new CreateSocialImageGenerationRequest(
      new db.PrismaSocialImageGenerationAuthorizationRepository(),
      requests,
    ).execute({
      environment: input.environment,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      groupMembershipId: membership.id,
      actorUserId: input.actorUserId,
      bunshinId: input.bunshinId,
      dailyMissionId: input.mission.id,
      campaignId: mission.campaignId,
      productPackVersionId: mission.contentLinkUsage?.productPackVersionId ?? null,
      layout: {
        templateKey: 'EDITORIAL_COVER',
        headline: input.mission.topic,
        bodyLines: [input.mission.angle],
        cta: '今日の投稿案を確認する',
        accentColor: brand?.primaryColor ?? '#0B356A',
      },
      idempotencyKey: operationKey,
    });
    if (request.status === 'READY_FOR_REVIEW')
      return { status: 'ALREADY_AVAILABLE', requestId: request.id };
    if (request.status === 'DRAFT')
      request = await new TransitionSocialImageGenerationRequest(requests).execute({
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        actorUserId: input.actorUserId,
        requestId: request.id,
        expectedRevision: request.revision,
        fromStatus: 'DRAFT',
        toStatus: 'QUEUED',
        errorCode: null,
      });
    if (!['QUEUED', 'GENERATING_ASSET', 'COMPOSING'].includes(request.status))
      throw new Error(`automatic image request cannot continue from ${request.status}`);
    await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      capabilityType: 'SOCIAL',
      correlationId: input.correlationId,
      requestedBy: input.actorUserId,
      environment: input.environment,
      jobType: SOCIAL_IMAGE_GENERATION_JOB_TYPE,
      payloadReference: `social-image:${request.id}`,
      idempotencyKey: `social-image:${request.id}`,
      priority: 60,
      maxAttempts: 5,
    });
    return { status: 'QUEUED', requestId: request.id };
  } catch (error) {
    if (reservation?.status === 'RESERVED')
      await finishServiceMediaGeneration({ reservation, outcome: 'RELEASED' }).catch(
        () => undefined,
      );
    return {
      status: 'SKIPPED',
      reason: error instanceof Error ? error.message.slice(0, 160) : 'AUTOMATIC_IMAGE_FAILED',
    };
  }
}
