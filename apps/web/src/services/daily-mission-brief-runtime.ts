import 'server-only';
import {
  GenerateDailyMissionBrief,
  type DailyMissionPlannerProviderInput,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { OpenAIDailyMissionPlanner } from '../providers/openai-daily-mission-planner';
import type { createDailyMissionAiRuntime } from './daily-mission-ai-runtime';

type DailyMissionAiRuntime = Awaited<ReturnType<typeof createDailyMissionAiRuntime>>;

export async function runDailyMissionBriefGeneration(input: {
  apiKey: string;
  model: string;
  plannerInput: Parameters<GenerateDailyMissionBrief['execute']>[0];
  generateWithQuota: DailyMissionAiRuntime['generateWithQuota'];
  recordUsage: DailyMissionAiRuntime['recordUsage'];
}) {
  const planningContexts: DailyMissionPlannerProviderInput[] = [];
  const provider = new OpenAIDailyMissionPlanner({ apiKey: input.apiKey, model: input.model });
  const brief = await input.generateWithQuota('daily-brief', () =>
    new GenerateDailyMissionBrief({
      generate: (value) => {
        planningContexts.push(structuredClone(value));
        return provider.generate(value);
      },
    }).execute(input.plannerInput),
  );
  await input.recordUsage('daily-brief', 'DAILY_MISSION_PLANNER', brief);
  const planningContext = planningContexts[0];
  if (!planningContext)
    throw new ApplicationError('INTERNAL_ERROR', 'daily mission planning context was not captured');
  return { ...brief, planningContext };
}
