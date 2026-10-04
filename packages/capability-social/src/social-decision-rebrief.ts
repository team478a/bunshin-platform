import { ApplicationError } from '@bunshin/shared';

import type { CampaignContentClassification } from '@bunshin/application';
import {
  MISSION_PERSONALIZATION_SOURCE_TYPES,
  type DailyMissionBrief,
  type MissionPersonalizationSourceType,
} from './mission-generation';
import type { SocialDecisionBoundary } from './social-decision-context';
import type { SocialDecisionRepairDisposition } from './social-decision-repair';
import type { SocialAccountStrategyGoal } from './social-account-strategy';
import type { SocialPlatform, SocialPreferredFormat } from './social-profile';

export const SOCIAL_DECISION_REBRIEF_POLICY_VERSION = 'social-decision-rebrief-v1';
export const SOCIAL_DECISION_REBRIEF_MAX_ATTEMPTS = 1 as const;
export const SOCIAL_DECISION_REBRIEF_MUTABLE_FIELDS = [
  'topic',
  'angle',
  'reason',
  'estimatedMinutes',
  'personalizationSourceTypes',
  'personalizationReason',
] as const;

export interface SocialDecisionRebriefConstraints {
  missionDate: string;
  timezone: string;
  platform: SocialPlatform;
  currentGoal: SocialAccountStrategyGoal;
  strategyVersion: number;
  weeklyGoal: string;
  weeklyAngle: string;
  format: SocialPreferredFormat;
  availableMinutes: 3 | 5 | 10 | 20;
  campaignId: string | null;
  classification: CampaignContentClassification;
}

export interface SocialDecisionRebriefPreviousDecision {
  topic: string;
  angle: string;
  reason: string;
  estimatedMinutes: number;
  personalizationSourceTypes: MissionPersonalizationSourceType[];
  personalizationReason: string | null;
}

export interface SocialDecisionRebriefOutput {
  topic: string;
  angle: string;
  reason: string;
  estimatedMinutes: number;
  personalizationSourceTypes: MissionPersonalizationSourceType[];
  personalizationReason: string;
}

export type SocialDecisionRebriefLockedConstraints = Omit<
  SocialDecisionRebriefConstraints,
  'campaignId'
> & {
  campaignAttached: boolean;
  trendUsed: boolean;
};

export interface SocialDecisionRebriefPreparation {
  policyVersion: typeof SOCIAL_DECISION_REBRIEF_POLICY_VERSION;
  decisionStage: 'REVISED_BRIEF';
  attempt: typeof SOCIAL_DECISION_REBRIEF_MAX_ATTEMPTS;
  maximumAttempts: typeof SOCIAL_DECISION_REBRIEF_MAX_ATTEMPTS;
  trigger: {
    reason: 'QUALITY_REVISE' | 'CONTENT_INSPECTION_FAILED';
    qualityIssueCodes: string[];
    contentInspectionIssue: SocialDecisionRepairDisposition['contentInspectionIssue'];
  };
  lockedConstraints: SocialDecisionRebriefLockedConstraints;
  previousDecision: SocialDecisionRebriefPreviousDecision;
  mutableFields: typeof SOCIAL_DECISION_REBRIEF_MUTABLE_FIELDS;
}

function assertPassedBoundary(boundary: SocialDecisionBoundary) {
  const blocked = Object.entries(boundary).filter(([, status]) => status !== 'PASSED');
  if (blocked.length > 0)
    throw new ApplicationError('CONFLICT', 'decision rebrief boundary is not ready', {
      boundary: Object.fromEntries(blocked),
    });
}

function previousDecision(brief: DailyMissionBrief): SocialDecisionRebriefPreviousDecision {
  return {
    topic: brief.topic,
    angle: brief.angle,
    reason: brief.reason,
    estimatedMinutes: brief.estimatedMinutes,
    personalizationSourceTypes: [...(brief.personalizationSourceTypes ?? [])],
    personalizationReason: brief.personalizationReason ?? null,
  };
}

function lockedConstraints(
  constraints: SocialDecisionRebriefConstraints,
  previousBrief: DailyMissionBrief,
): SocialDecisionRebriefLockedConstraints {
  const { campaignId, ...providerSafe } = constraints;
  return {
    ...structuredClone(providerSafe),
    campaignAttached: campaignId !== null,
    trendUsed: previousBrief.trendCandidateId !== undefined,
  };
}

/**
 * Builds a provider-safe revision contract. It does not call a provider, consume quota or persist
 * a revision. Scope IDs and raw generated content are intentionally excluded.
 */
export function prepareSocialDecisionRebrief(input: {
  attempt: number;
  boundary: SocialDecisionBoundary;
  disposition: SocialDecisionRepairDisposition;
  constraints: SocialDecisionRebriefConstraints;
  previousBrief: DailyMissionBrief;
}): SocialDecisionRebriefPreparation {
  if (
    input.disposition.action !== 'REBRIEF_REQUIRED' ||
    input.disposition.nextDecisionStage !== 'REVISED_BRIEF'
  )
    throw new ApplicationError('CONFLICT', 'decision disposition does not allow rebrief');
  if (input.attempt !== SOCIAL_DECISION_REBRIEF_MAX_ATTEMPTS)
    throw new ApplicationError('CONFLICT', 'decision rebrief attempt limit exceeded', {
      attempted: input.attempt,
      maximumAttempts: SOCIAL_DECISION_REBRIEF_MAX_ATTEMPTS,
    });
  assertPassedBoundary(input.boundary);
  if (
    input.previousBrief.missionDate !== input.constraints.missionDate ||
    input.previousBrief.format !== input.constraints.format ||
    input.previousBrief.campaignId !== input.constraints.campaignId ||
    input.previousBrief.classification !== input.constraints.classification
  )
    throw new ApplicationError('CONFLICT', 'previous decision does not match rebrief constraints');
  if (input.previousBrief.estimatedMinutes > input.constraints.availableMinutes)
    throw new ApplicationError('CONFLICT', 'previous decision exceeds rebrief time boundary');

  return {
    policyVersion: SOCIAL_DECISION_REBRIEF_POLICY_VERSION,
    decisionStage: 'REVISED_BRIEF',
    attempt: SOCIAL_DECISION_REBRIEF_MAX_ATTEMPTS,
    maximumAttempts: SOCIAL_DECISION_REBRIEF_MAX_ATTEMPTS,
    trigger: {
      reason: input.disposition.reason,
      qualityIssueCodes: [...input.disposition.qualityIssueCodes],
      contentInspectionIssue: input.disposition.contentInspectionIssue,
    },
    lockedConstraints: lockedConstraints(input.constraints, input.previousBrief),
    previousDecision: previousDecision(input.previousBrief),
    mutableFields: SOCIAL_DECISION_REBRIEF_MUTABLE_FIELDS,
  };
}

function assertExactOutputFields(output: SocialDecisionRebriefOutput) {
  const fields = Object.keys(output).sort();
  const expected = [...SOCIAL_DECISION_REBRIEF_MUTABLE_FIELDS].sort();
  if (fields.length !== expected.length || fields.some((field, index) => field !== expected[index]))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid decision rebrief output fields');
}

function assertRebriefOutput(
  output: SocialDecisionRebriefOutput,
  locked: SocialDecisionRebriefLockedConstraints,
) {
  assertExactOutputFields(output);
  for (const [field, value, maximum] of [
    ['topic', output.topic, 200],
    ['angle', output.angle, 500],
    ['reason', output.reason, 1000],
    ['personalizationReason', output.personalizationReason, 500],
  ] as const) {
    if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maximum)
      throw new ApplicationError('VALIDATION_ERROR', `invalid decision rebrief ${field}`);
  }
  if (
    !Number.isInteger(output.estimatedMinutes) ||
    output.estimatedMinutes < 1 ||
    output.estimatedMinutes > locked.availableMinutes
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid decision rebrief estimated minutes');
  if (
    !Array.isArray(output.personalizationSourceTypes) ||
    output.personalizationSourceTypes.length === 0 ||
    output.personalizationSourceTypes.some(
      (source) => !(MISSION_PERSONALIZATION_SOURCE_TYPES as readonly unknown[]).includes(source),
    ) ||
    new Set(output.personalizationSourceTypes).size !== output.personalizationSourceTypes.length
  )
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'invalid decision rebrief personalization sources',
    );
}

function assertPreparationMatchesBrief(
  preparation: SocialDecisionRebriefPreparation,
  previousBrief: DailyMissionBrief,
) {
  const locked = preparation.lockedConstraints;
  const expectedPrevious = previousDecision(previousBrief);
  const actualPrevious = preparation.previousDecision;
  const mutableFieldsMatch =
    preparation.mutableFields.length === SOCIAL_DECISION_REBRIEF_MUTABLE_FIELDS.length &&
    preparation.mutableFields.every(
      (field, index) => field === SOCIAL_DECISION_REBRIEF_MUTABLE_FIELDS[index],
    );
  const previousDecisionMatches =
    actualPrevious.topic === expectedPrevious.topic &&
    actualPrevious.angle === expectedPrevious.angle &&
    actualPrevious.reason === expectedPrevious.reason &&
    actualPrevious.estimatedMinutes === expectedPrevious.estimatedMinutes &&
    actualPrevious.personalizationReason === expectedPrevious.personalizationReason &&
    actualPrevious.personalizationSourceTypes.length ===
      expectedPrevious.personalizationSourceTypes.length &&
    actualPrevious.personalizationSourceTypes.every(
      (source, index) => source === expectedPrevious.personalizationSourceTypes[index],
    );
  if (
    preparation.policyVersion !== SOCIAL_DECISION_REBRIEF_POLICY_VERSION ||
    preparation.decisionStage !== 'REVISED_BRIEF' ||
    preparation.attempt !== SOCIAL_DECISION_REBRIEF_MAX_ATTEMPTS ||
    preparation.maximumAttempts !== SOCIAL_DECISION_REBRIEF_MAX_ATTEMPTS ||
    locked.missionDate !== previousBrief.missionDate ||
    locked.format !== previousBrief.format ||
    locked.campaignAttached !== (previousBrief.campaignId !== null) ||
    locked.trendUsed !== (previousBrief.trendCandidateId !== undefined) ||
    locked.classification !== previousBrief.classification ||
    !mutableFieldsMatch ||
    !previousDecisionMatches
  )
    throw new ApplicationError('CONFLICT', 'decision rebrief preparation does not match brief');
}

/**
 * Restores provider-safe reBrief output into the original Brief without allowing provider data to
 * replace internal references or locked decision fields. It does not persist or call a provider.
 */
export function finalizeSocialDecisionRebrief(input: {
  preparation: SocialDecisionRebriefPreparation;
  previousBrief: DailyMissionBrief;
  output: SocialDecisionRebriefOutput;
}): DailyMissionBrief {
  assertPreparationMatchesBrief(input.preparation, input.previousBrief);
  assertRebriefOutput(input.output, input.preparation.lockedConstraints);
  return {
    missionDate: input.previousBrief.missionDate,
    socialProfileId: input.previousBrief.socialProfileId,
    weeklyPlanItemId: input.previousBrief.weeklyPlanItemId,
    format: input.previousBrief.format,
    topic: input.output.topic.trim(),
    angle: input.output.angle.trim(),
    reason: input.output.reason.trim(),
    estimatedMinutes: input.output.estimatedMinutes,
    ...(input.previousBrief.trendCandidateId === undefined
      ? {}
      : { trendCandidateId: input.previousBrief.trendCandidateId }),
    campaignId: input.previousBrief.campaignId,
    classification: input.previousBrief.classification,
    personalizationSourceTypes: [...input.output.personalizationSourceTypes],
    personalizationReason: input.output.personalizationReason.trim(),
  };
}
