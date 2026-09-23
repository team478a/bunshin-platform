import 'server-only';
import { GenerateDailyMissionBrief } from '@bunshin/capability-social';
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
  const brief = await input.generateWithQuota('daily-brief', () =>
    new GenerateDailyMissionBrief(
      new OpenAIDailyMissionPlanner({ apiKey: input.apiKey, model: input.model }),
    ).execute(input.plannerInput),
  );
  await input.recordUsage('daily-brief', 'DAILY_MISSION_PLANNER', brief);
  return brief;
}
