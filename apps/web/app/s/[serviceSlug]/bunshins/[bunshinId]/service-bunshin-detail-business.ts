import { businessGrowthProgramStatus } from '@bunshin/application';
import type { ListSocialAccountStrategies } from '@bunshin/capability-social';
import type { DailyMissionView } from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';
import { buildBusinessResponseInsight } from './business-response-insights';

type AccountStrategy = Awaited<ReturnType<ListSocialAccountStrategies['execute']>>[number];

export function resolveServiceBunshinBusinessDetail(input: {
  enabled: boolean;
  accountStrategies: AccountStrategy[];
  dailyMissions: DailyMissionView[];
  programStartedAt: Date | null;
  currentDate: string;
}) {
  const approvedBusinessStrategy = input.enabled
    ? input.accountStrategies
        .filter(({ status }) => status === 'APPROVED')
        .sort((left, right) => right.version - left.version)[0]
    : undefined;
  const successfulBusinessTopic = input.enabled
    ? buildBusinessResponseInsight(input.dailyMissions).bestTopic
    : null;
  const businessProgram = input.programStartedAt
    ? businessGrowthProgramStatus({
        startedAt: input.programStartedAt,
        currentDate: input.currentDate,
      })
    : null;

  return { approvedBusinessStrategy, successfulBusinessTopic, businessProgram };
}
