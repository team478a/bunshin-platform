import 'server-only';
import type { MissionAutomationHandler } from '@bunshin/application';
import { createDailyMissionGenerationService } from '../services/daily-mission-generation';

export function createDailyMissionJobHandler(): MissionAutomationHandler {
  return {
    async execute({ job, localDate }) {
      if (!job.bunshinId) return;
      await createDailyMissionGenerationService().execute({
        workspaceId: job.workspaceId,
        bunshinId: job.bunshinId,
        actorUserId: job.requestedBy,
        missionDate: localDate,
        generationIdempotencyKey: job.idempotencyKey,
        usageIdempotencyPrefix: `job:${job.id}:daily-mission`,
        existingPolicy: 'RETURN',
      });
    },
  };
}
