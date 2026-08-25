import 'server-only';
import { MissionAutomationHandlerError, type MissionAutomationHandler } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { TrendSearchProviderError } from '../providers/trend-research-provider';
import { WeeklyTrendResearchGenerationService } from '../services/weekly-trend-research';

export function createTrendResearchJobHandler(): MissionAutomationHandler {
  return {
    async execute({ job, localDate }) {
      if (!job.bunshinId) return;
      const match = /^trend-research:([0-9a-f-]{36}):/.exec(job.payloadReference);
      if (!match) throw new MissionAutomationHandlerError('INVALID_JOB_REFERENCE', false);
      try {
        await new WeeklyTrendResearchGenerationService().execute({
          workspaceId: job.workspaceId,
          bunshinId: job.bunshinId,
          actorUserId: job.requestedBy,
          socialProfileId: match[1]!,
          periodStart: localDate,
          usageIdempotencyKey: `job:${job.id}:trend-research:${job.attemptCount}`,
        });
      } catch (error) {
        if (error instanceof TrendSearchProviderError)
          throw new MissionAutomationHandlerError(error.category, error.retryable);
        if (error instanceof ApplicationError) {
          const retryable = !['CONFIGURATION_ERROR', 'CONFLICT', 'FORBIDDEN', 'NOT_FOUND'].includes(
            error.code,
          );
          throw new MissionAutomationHandlerError(error.code, retryable);
        }
        throw new MissionAutomationHandlerError('TREND_RESEARCH_UNEXPECTED', true);
      }
    },
  };
}
