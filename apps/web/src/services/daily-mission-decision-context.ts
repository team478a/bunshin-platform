import 'server-only';

import {
  prepareSocialDecisionPlannerInput,
  type DailyMissionPlannerInput,
  type SocialDecisionBoundaryStatus,
  type SocialDecisionObservation,
  type SocialDecisionScope,
} from '@bunshin/capability-social';

import { buildGoalOutcomePlanningContext } from './weekly-plan-generation';

type OutcomeRecord = Parameters<typeof buildGoalOutcomePlanningContext>[1][number];

export interface DailyMissionDecisionContextSource {
  enabled: boolean;
  safetyLegal: SocialDecisionBoundaryStatus;
  observations: readonly SocialDecisionObservation[];
  outcomeRecords: readonly OutcomeRecord[];
}

function effectiveWeeklyPlan(input: DailyMissionPlannerInput) {
  if (input.weeklyPlan.strategyId !== null || input.weeklyPlan.strategyGoal !== null)
    return input.weeklyPlan;
  return {
    ...input.weeklyPlan,
    socialProfileId: input.weeklyPlan.socialProfileId ?? input.socialProfile.id,
    strategyId: input.approvedStrategy.id,
    strategyGoal: input.approvedStrategy.goal,
  };
}

export function prepareDailyMissionDecisionPlannerInput(input: {
  scope: {
    workspaceId: string;
    groupId?: string | null;
    bunshinId: string;
    actorUserId: string;
  };
  plannerInput: DailyMissionPlannerInput;
  source: DailyMissionDecisionContextSource | null;
}) {
  if (!input.source?.enabled) return { context: null, plannerInput: input.plannerInput };
  const scope: SocialDecisionScope = {
    workspaceId: input.scope.workspaceId,
    groupId: input.scope.groupId ?? null,
    ownerUserId: input.scope.actorUserId,
    bunshinId: input.scope.bunshinId,
  };
  const source = <T>(data: T) => ({ scope, data });
  const goal = input.plannerInput.approvedStrategy.goal;
  const goalEvaluation = buildGoalOutcomePlanningContext(goal, [
    ...input.source.outcomeRecords,
  ]).goalEvaluation;
  return prepareSocialDecisionPlannerInput({
    scope,
    boundary: {
      authorization: 'PASSED',
      capability: 'PASSED',
      ownership: 'PASSED',
      safetyLegal: input.source.safetyLegal,
    },
    currentGoal: goal,
    observations: [
      ...input.source.observations.map((observation) => source(observation)),
      source({ id: `goal-outcome:${goal}`, type: 'OUTCOME' as const, data: goalEvaluation }),
    ],
    plannerInput: {
      ...input.plannerInput,
      weeklyPlan: effectiveWeeklyPlan(input.plannerInput),
    },
  });
}
