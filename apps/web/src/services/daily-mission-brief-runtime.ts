import 'server-only';
import {
  GenerateDailyMissionBrief,
  type DailyMissionPlannerProviderInput,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { OpenAIDailyMissionPlanner } from '../providers/openai-daily-mission-planner';
import { DAILY_MISSION_PLANNER_PROMPT_VERSION } from '../providers/openai-daily-mission-planner';
import type { createDailyMissionAiRuntime } from './daily-mission-ai-runtime';

type DailyMissionAiRuntime = Awaited<ReturnType<typeof createDailyMissionAiRuntime>>;

export async function runDailyMissionBriefGeneration(input: {
  plannerInput: Parameters<GenerateDailyMissionBrief['execute']>[0];
  executeAiStep: DailyMissionAiRuntime['execute'];
}) {
  const planningContexts: DailyMissionPlannerProviderInput[] = [];
  const brief = await input.executeAiStep({
    suffix: 'daily-brief',
    taskType: 'DAILY_MISSION_PLANNER',
    promptVersion: DAILY_MISSION_PLANNER_PROMPT_VERSION,
    generate: (runtime) => {
      const provider = new OpenAIDailyMissionPlanner({
        apiKey: runtime.apiKey,
        model: runtime.model,
      });
      return new GenerateDailyMissionBrief({
        generate: (value) => {
          planningContexts.push(structuredClone(value));
          return provider.generate(value);
        },
      }).execute(input.plannerInput);
    },
  });
  const planningContext = planningContexts[0];
  if (!planningContext)
    throw new ApplicationError('INTERNAL_ERROR', 'daily mission planning context was not captured');
  return { ...brief, planningContext };
}
