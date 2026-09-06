import 'server-only';
import type { MissionAutomationHandler } from '@bunshin/application';
import { createWeeklyPlanGenerationService } from '../services/weekly-plan-generation';
import { prepareServiceAutomaticWeek } from './service-automatic-week';

export function createWeeklyPlanJobHandler(): MissionAutomationHandler {
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
        await prepareServiceAutomaticWeek({
          ...scope,
          groupId: scope.groupId,
          weekStartDate: localDate,
          usageIdempotencyKey: `job:${job.id}:weekly-plan`,
        });
        return;
      }
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
