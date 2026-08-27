import 'server-only';
import {
  EnqueueJob,
  PrepareLineMissionDelivery,
  type MissionAutomationHandler,
} from '@bunshin/application';
import { createDailyMissionGenerationService } from '../services/daily-mission-generation';
import { currentActivityContinuityRule } from '../activity-continuity-rule';

export function createDailyMissionJobHandler(): MissionAutomationHandler {
  return {
    async execute({ job, localDate }) {
      if (!job.bunshinId) return;
      const mission = await createDailyMissionGenerationService().execute({
        workspaceId: job.workspaceId,
        bunshinId: job.bunshinId,
        actorUserId: job.requestedBy,
        missionDate: localDate,
        generationIdempotencyKey: job.idempotencyKey,
        usageIdempotencyPrefix: `job:${job.id}:daily-mission`,
        existingPolicy: 'RETURN',
      });
      const db = await import('@bunshin/database');
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
