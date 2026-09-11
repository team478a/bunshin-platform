import 'server-only';
import {
  EnqueueJob,
  PrepareLineMissionDelivery,
  type MissionAutomationHandler,
} from '@bunshin/application';
import { createDailyMissionGenerationService } from '../services/daily-mission-generation';
import { currentActivityContinuityRule } from '../activity-continuity-rule';
import { mondayForDate, prepareServiceAutomaticWeek } from './service-automatic-week';
import { readServiceOnboardingSettings } from '../services/service-onboarding-settings';
import { resolveServiceContentAssistanceLevel } from '../services/service-generation-knowledge';
import {
  createServiceDailyIdeaFallback,
  shouldUseServiceDailyIdeaFallback,
} from '../services/service-daily-idea-fallback';
import { queueAutomaticDailyImage } from '../services/automatic-daily-image';
import { queueAutomaticDailyVideo } from '../services/automatic-daily-video';
import { createLogger } from '@bunshin/observability';

export function createDailyMissionJobHandler(): MissionAutomationHandler {
  return {
    async execute({ job, localDate }) {
      if (!job.bunshinId) return;
      const db = await import('@bunshin/database');
      const scope = await new db.PrismaMissionAutomationScopeRepository().resolveScope({
        workspaceId: job.workspaceId,
        bunshinId: job.bunshinId,
        actorUserId: job.requestedBy,
      });
      const policy = scope.groupId
        ? await db.prisma.serviceRegistrationPolicy.findFirst({
            where: { workspaceId: scope.workspaceId, groupId: scope.groupId },
            select: { onboardingConfig: true, surveyConfig: true },
          })
        : null;
      const dailyIdeas = scope.groupId
        ? readServiceOnboardingSettings(policy?.onboardingConfig, policy?.surveyConfig)
            .dailyIdeaDelivery
        : null;
      if (scope.groupId) {
        const plan = await prepareServiceAutomaticWeek({
          ...scope,
          groupId: scope.groupId,
          weekStartDate: mondayForDate(localDate),
          usageIdempotencyKey: `job:${job.id}:weekly-plan`,
        });
        // A day off is successful, not a failed generation requiring user intervention.
        if (!plan.items.some((item) => item.scheduledDate === localDate)) {
          createLogger().info('daily mission skipped for unscheduled date', {
            jobId: job.id,
            correlationId: job.correlationId,
            environment: job.environment,
            localDate,
            reason: 'UNSCHEDULED_DATE',
          });
          return;
        }
      }
      let mission;
      try {
        mission = await createDailyMissionGenerationService().execute({
          ...scope,
          serviceSafeMode: Boolean(scope.groupId),
          ...(scope.groupId ? { allowServiceOwnerMemories: true } : {}),
          missionDate: localDate,
          generationIdempotencyKey: job.idempotencyKey,
          usageIdempotencyPrefix: `job:${job.id}:daily-mission`,
          existingPolicy: 'RETURN',
        });
      } catch (error) {
        if (!scope.groupId || !shouldUseServiceDailyIdeaFallback(error)) throw error;
        if (!dailyIdeas?.enabled) throw error;
        const assistanceLevel = await resolveServiceContentAssistanceLevel({
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          actorUserId: scope.actorUserId,
        });
        mission = await createServiceDailyIdeaFallback({
          ...scope,
          groupId: scope.groupId,
          missionDate: localDate,
          ...(assistanceLevel ? { assistanceLevel } : {}),
        });
      }
      if (scope.groupId && dailyIdeas?.enabled)
        await queueAutomaticDailyImage({
          environment: job.environment,
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          actorUserId: scope.actorUserId,
          bunshinId: scope.bunshinId,
          correlationId: job.correlationId,
          mission,
          mediaMode: dailyIdeas.mediaMode,
        });
      const activityRule = await currentActivityContinuityRule();
      if (scope.groupId && dailyIdeas?.enabled)
        await queueAutomaticDailyVideo({
          environment: job.environment,
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          actorUserId: scope.actorUserId,
          bunshinId: scope.bunshinId,
          correlationId: job.correlationId,
          mission,
          mediaMode: dailyIdeas.mediaMode,
        });
      const returnReminder = await new db.PrismaLineReturnReminderRepository().shouldUse({
        workspaceId: job.workspaceId,
        bunshinId: job.bunshinId,
        actorUserId: job.requestedBy,
        localDate,
        dormancyDays: activityRule.dormancyDays,
        cooldownDays: 7,
      });
      const delivery = await new PrepareLineMissionDelivery(
        new db.PrismaLineMessageDeliveryRepository(),
      ).execute({
        environment: job.environment,
        workspaceId: job.workspaceId,
        bunshinId: job.bunshinId,
        actorUserId: job.requestedBy,
        dailyMissionId: mission.id,
        kind: returnReminder ? 'REMINDER' : 'DAILY_MISSION',
        idempotencyKey: `daily-mission:${job.environment}:${job.requestedBy}:${mission.id}`,
        scheduledAt: new Date(),
      });
      await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
        environment: job.environment,
        workspaceId: job.workspaceId,
        bunshinId: job.bunshinId,
        capabilityType: 'SOCIAL',
        correlationId: job.correlationId,
        requestedBy: job.requestedBy,
        jobType: 'LINE_MISSION_DELIVER',
        payloadReference: `line-delivery:${delivery.id}`,
        idempotencyKey: `line-delivery:${job.environment}:${delivery.id}`,
        priority: 50,
        maxAttempts: 5,
      });
    },
  };
}
