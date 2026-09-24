import 'server-only';
import { ServiceReferralRewardService } from '@bunshin/application';
import { RecordManualPost, RecordMissionFeedback } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { requireSameOrigin } from '../auth/request-security';
import { readBusinessOutcomes, writeBusinessOutcomes } from '../services/business-outcomes';
import { resolvePublicServiceContext } from '../services/public-service';
import { readServiceOnboardingSettings } from '../services/service-onboarding-settings';
import { missionActivityDto } from './mission-engagement';
import { missionFeedbackDto, postRecordDto } from './mission-outcome';
import {
  body,
  businessOutcomeSchema,
  feedbackSchema,
  postSchema,
  respond,
  serviceDailyMissionScope,
  uuidSchema,
} from './service-daily-mission-http-core';

export function recordServicePostResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = postSchema.safeParse(await body(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const db = await import('@bunshin/database');
    const value = await serviceDailyMissionScope(serviceSlug, bunshinId);
    const result = await new RecordManualPost(
      new db.PrismaDailyMissionRepository(),
      new db.PrismaBunshinCapabilityAssignmentRepository(),
      new db.PrismaMissionOutcomeRepository(),
    ).execute({
      ...value,
      dailyMissionId: uuidSchema.parse(dailyMissionId),
      ...parsed.data,
    });
    await new ServiceReferralRewardService(
      new db.PrismaServiceReferralRewardRepository(),
    ).completeMilestone({
      workspaceId: value.workspaceId,
      groupId: value.groupId,
      referredUserId: value.actorUserId,
      milestone: 'FIRST_POST_REPORTED',
    });
    return { post: postRecordDto(result.post), activity: missionActivityDto(result.activity) };
  });
}

export function recordServiceMissionFeedbackResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = feedbackSchema.safeParse(await body(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const db = await import('@bunshin/database');
    const result = await new RecordMissionFeedback(
      new db.PrismaDailyMissionRepository(),
      new db.PrismaBunshinCapabilityAssignmentRepository(),
      new db.PrismaMissionOutcomeRepository(),
    ).execute({
      ...(await serviceDailyMissionScope(serviceSlug, bunshinId)),
      dailyMissionId: uuidSchema.parse(dailyMissionId),
      ...parsed.data,
    });
    return {
      feedback: missionFeedbackDto(result.feedback),
      activity: missionActivityDto(result.activity),
    };
  });
}

export function recordServiceBusinessOutcomeResponse(
  request: Request,
  serviceSlug: string,
  bunshinId: string,
  dailyMissionId: string,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const parsed = businessOutcomeSchema.safeParse(await body(request));
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const service = await resolvePublicServiceContext(serviceSlug);
    const onboarding = readServiceOnboardingSettings(
      service.configuration.registration.onboardingConfig,
      service.configuration.registration.surveyConfig,
    );
    if (!onboarding.businessProfileEnabled)
      throw new ApplicationError('FORBIDDEN', 'business outcome reporting is not enabled');
    const value = await serviceDailyMissionScope(serviceSlug, bunshinId);
    const db = await import('@bunshin/database');
    const repository = new db.PrismaMissionOutcomeRepository();
    const post = await repository.getPost({
      ...value,
      dailyMissionId: uuidSchema.parse(dailyMissionId),
    });
    if (!post) throw new ApplicationError('CONFLICT', 'post must be recorded first');
    const outcomes = readBusinessOutcomes({ businessOutcomes: parsed.data });
    await db.prisma.postRecord.update({
      where: { id: post.id },
      data: { manualMetrics: writeBusinessOutcomes(post.manualMetrics, outcomes) },
    });
    return { outcomes };
  });
}
