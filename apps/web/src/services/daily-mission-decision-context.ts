import 'server-only';

import {
  prepareSocialDecisionPlannerInput,
  type DailyMissionPlannerInput,
  type SocialDecisionBoundary,
  type SocialDecisionBoundaryStatus,
  type SocialDecisionObservation,
  type SocialDecisionScope,
} from '@bunshin/capability-social';
import type {
  GenerationDecisionMetadata,
  GenerationDecisionRevisionMetadata,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

import { buildGoalOutcomePlanningContext } from './weekly-plan-generation';

type OutcomeRecord = Parameters<typeof buildGoalOutcomePlanningContext>[1][number];

export const SOCIAL_DAILY_DECISION_VERSION = 'social-daily-decision-v1';

export interface DailyMissionDecisionContextSource {
  enabled: boolean;
  safetyLegal: SocialDecisionBoundaryStatus;
  observations: readonly SocialDecisionObservation[];
  outcomeRecords: readonly OutcomeRecord[];
}

export function buildDailyMissionDecisionMetadata(input: {
  context: ReturnType<typeof prepareSocialDecisionPlannerInput>['context'] | null;
  plannerPromptVersion: string;
  revision?: GenerationDecisionRevisionMetadata | null;
}): GenerationDecisionMetadata | null {
  if (!input.context) return null;
  if (input.context.status !== 'READY')
    throw new ApplicationError('CONFLICT', 'only ready decision context can be snapshotted');
  const ignored = new Map<string, GenerationDecisionMetadata['ignoredSignals'][number]>();
  for (const signal of input.context.signals) {
    if (signal.ignoredReason === null) continue;
    const key = `${signal.type}:${signal.ignoredReason}`;
    const current = ignored.get(key);
    ignored.set(key, {
      type: signal.type,
      reason: signal.ignoredReason,
      count: (current?.count ?? 0) + 1,
    });
  }
  return {
    schemaVersion: 1,
    decisionEngineVersion: SOCIAL_DAILY_DECISION_VERSION,
    plannerPromptVersion: input.plannerPromptVersion,
    contextVersion: input.context.version,
    decisionStage: input.revision ? 'REVISED_BRIEF' : 'DAILY',
    status: 'READY',
    evidenceCompleteness: input.context.evidenceCompleteness,
    eligibleSignalTypes: [...new Set(input.context.orderedSignals.map(({ type }) => type))],
    ignoredSignals: [...ignored.values()],
    missingInputs: [...input.context.missingInputs],
    limitations: [...input.context.limitations],
    ...(input.revision ? { revision: structuredClone(input.revision) } : {}),
  };
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
  if (!input.source?.enabled)
    return { context: null, plannerInput: input.plannerInput, boundary: null };
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
  const boundary: SocialDecisionBoundary = {
    authorization: 'PASSED',
    capability: 'PASSED',
    ownership: 'PASSED',
    safetyLegal: input.source.safetyLegal,
  };
  return {
    ...prepareSocialDecisionPlannerInput({
      scope,
      boundary,
      currentGoal: goal,
      observations: [
        ...input.source.observations.map((observation) => source(observation)),
        source({ id: `goal-outcome:${goal}`, type: 'OUTCOME' as const, data: goalEvaluation }),
      ],
      plannerInput: {
        ...input.plannerInput,
        weeklyPlan: effectiveWeeklyPlan(input.plannerInput),
      },
    }),
    boundary,
  };
}
