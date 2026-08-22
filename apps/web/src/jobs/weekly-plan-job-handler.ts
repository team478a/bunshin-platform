import 'server-only';
import type { MissionAutomationHandler } from '@bunshin/application';
import { createWeeklyPlanGenerationService } from '../services/weekly-plan-generation';

export function createWeeklyPlanJobHandler(): MissionAutomationHandler {
  return {
    async execute({ job, localDate }) {
      if (!job.bunshinId) return;
      const service = await createWeeklyPlanGenerationService();
      await service.execute({
        workspaceId: job.workspaceId,
        bunshinId: job.bunshinId,
        actorUserId: job.requestedBy,
        weekStartDate: localDate,
        usageIdempotencyKey: `job:${job.id}:weekly-plan`,
        existingPolicy: 'RETURN',
      });
    },
  };
}
