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
import {
  createServiceDailyIdeaFallback,
  shouldUseServiceDailyIdeaFallback,
} from '../services/service-daily-idea-fallback';

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
      if (scope.groupId) {
        const plan = await prepareServiceAutomaticWeek({
          ...scope,
          groupId: scope.groupId,
          weekStartDate: mondayForDate(localDate),
          usageIdempotencyKey: `job:${job.id}:weekly-plan`,
        });
        // A day off is successful, not a failed generation requiring user intervention.
        if (!plan.items.some((item) => item.scheduledDate === localDate)) return;
      }
      let mission;
      try {
        mission = await createDailyMissionGenerationService().execute({
          ...scope,
          serviceSafeMode: Boolean(scope.groupId),
          missionDate: localDate,
          generationIdempotencyKey: job.idempotencyKey,
          usageIdempotencyPrefix: `job:${job.id}:daily-mission`,
          existingPolicy: 'RETURN',
        });
      } catch (error) {
        if (!scope.groupId || !shouldUseServiceDailyIdeaFallback(error)) throw error;
        const policy = await db.prisma.serviceRegistrationPolicy.findFirst({
          where: { workspaceId: scope.workspaceId, groupId: scope.groupId },
          select: { onboardingConfig: true, surveyConfig: true },
        });
        const dailyIdeas = readServiceOnboardingSettings(
          policy?.onboardingConfig,
          policy?.surveyConfig,
        ).dailyIdeaDelivery;
        if (!dailyIdeas.enabled) throw error;
        mission = await createServiceDailyIdeaFallback({
          ...scope,
          groupId: scope.groupId,
          missionDate: localDate,
        });
      }
      const activityRule = await currentActivityContinuityRule();
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
