import 'server-only';

import { createHash } from 'node:crypto';

import type { GenerationDecisionRevisionMetadata } from '@bunshin/application';
import {
  SOCIAL_DECISION_REBRIEF_ORCHESTRATION_POLICY_VERSION,
  finalizeSocialDecisionRebrief,
  prepareSocialDecisionRebrief,
  type DailyMissionBrief,
  type SocialDecisionBoundary,
  type SocialDecisionRepairDisposition,
} from '@bunshin/capability-social';

import { OpenAIDailyMissionRebriefPlanner } from '../providers/openai-daily-mission-rebrief-planner';
import type { createDailyMissionAiRuntime } from './daily-mission-ai-runtime';
import type { runDailyMissionBriefGeneration } from './daily-mission-brief-runtime';

type DailyMissionAiRuntime = Awaited<ReturnType<typeof createDailyMissionAiRuntime>>;
type BriefResult = Awaited<ReturnType<typeof runDailyMissionBriefGeneration>>;

export type DailyMissionDecisionRevisionDraft = Omit<
  GenerationDecisionRevisionMetadata,
  'finalQuality'
>;

function decisionReference(input: {
  stage: 'DAILY' | 'REVISED_BRIEF';
  brief: DailyMissionBrief;
  plannerModel: string;
  plannerPromptVersion: string;
}) {
  const decision = {
    stage: input.stage,
    missionDate: input.brief.missionDate,
    format: input.brief.format,
    classification: input.brief.classification,
    campaignAttached: input.brief.campaignId !== null,
    trendUsed: input.brief.trendCandidateId !== undefined,
    topic: input.brief.topic,
    angle: input.brief.angle,
    reason: input.brief.reason,
    estimatedMinutes: input.brief.estimatedMinutes,
    personalizationSourceTypes: input.brief.personalizationSourceTypes ?? [],
    personalizationReason: input.brief.personalizationReason ?? null,
    plannerModel: input.plannerModel,
    plannerPromptVersion: input.plannerPromptVersion,
  };
  return `sha256:${createHash('sha256').update(JSON.stringify(decision)).digest('hex')}`;
}

export async function runDailyMissionRebriefGeneration(input: {
  apiKey: string;
  model: string;
  initialBrief: BriefResult;
  strategyVersion: number;
  boundary: SocialDecisionBoundary;
  disposition: SocialDecisionRepairDisposition & { action: 'REBRIEF_REQUIRED' };
  generateWithQuota: DailyMissionAiRuntime['generateWithQuota'];
  recordUsage: DailyMissionAiRuntime['recordUsage'];
  setStage: (stage: string) => void;
  planner?: Pick<OpenAIDailyMissionRebriefPlanner, 'generate'>;
}) {
  const preparation = prepareSocialDecisionRebrief({
    attempt: 1,
    boundary: input.boundary,
    disposition: input.disposition,
    constraints: {
      missionDate: input.initialBrief.planningContext.missionDate,
      timezone: input.initialBrief.planningContext.timezone,
      platform: input.initialBrief.planningContext.platform,
      currentGoal: input.initialBrief.planningContext.approvedStrategy.goal,
      strategyVersion: input.strategyVersion,
      weeklyGoal: input.initialBrief.planningContext.weeklyItem.goal,
      weeklyAngle: input.initialBrief.planningContext.weeklyItem.angle,
      format: input.initialBrief.output.format,
      availableMinutes: input.initialBrief.planningContext.availableMinutes,
      campaignId: input.initialBrief.output.campaignId,
      classification: input.initialBrief.output.classification,
    },
    previousBrief: input.initialBrief.output,
  });
  input.setStage('decision-rebrief:1');
  const planner =
    input.planner ??
    new OpenAIDailyMissionRebriefPlanner({
      apiKey: input.apiKey,
      model: input.model,
    });
  const generated = await input.generateWithQuota('decision-rebrief:1', () =>
    planner.generate({
      planningContext: input.initialBrief.planningContext,
      revision: preparation,
    }),
  );
  await input.recordUsage('decision-rebrief:1', 'DAILY_MISSION_REBRIEF', generated);
  const output = finalizeSocialDecisionRebrief({
    preparation,
    previousBrief: input.initialBrief.output,
    output: generated.output,
  });
  const revision: DailyMissionDecisionRevisionDraft = {
    schemaVersion: 1,
    policyVersion: preparation.policyVersion,
    orchestrationPolicyVersion: SOCIAL_DECISION_REBRIEF_ORCHESTRATION_POLICY_VERSION,
    attempt: preparation.attempt,
    maximumAttempts: preparation.maximumAttempts,
    revisionOfDecisionRef: decisionReference({
      stage: 'DAILY',
      brief: input.initialBrief.output,
      plannerModel: input.initialBrief.model,
      plannerPromptVersion: input.initialBrief.promptVersion,
    }),
    decisionRef: decisionReference({
      stage: 'REVISED_BRIEF',
      brief: output,
      plannerModel: generated.model,
      plannerPromptVersion: generated.promptVersion,
    }),
    trigger: structuredClone(preparation.trigger),
    initialPlannerModel: input.initialBrief.model,
    initialPlannerPromptVersion: input.initialBrief.promptVersion,
    rebriefModel: generated.model,
    rebriefPlannerPromptVersion: generated.promptVersion,
  };
  return {
    brief: {
      ...generated,
      output,
      planningContext: input.initialBrief.planningContext,
    },
    revision,
  };
}
