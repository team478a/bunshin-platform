import { ApplicationError } from '@bunshin/shared';

import type { CampaignContentClassification } from '@bunshin/application';
import type { DailyMissionBrief, MissionPersonalizationSourceType } from './mission-generation';
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

export type SocialDecisionRebriefLockedConstraints = Omit<
  SocialDecisionRebriefConstraints,
  'campaignId'
> & {
  campaignAttached: boolean;
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
): SocialDecisionRebriefLockedConstraints {
  const { campaignId, ...providerSafe } = constraints;
  return { ...structuredClone(providerSafe), campaignAttached: campaignId !== null };
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
    lockedConstraints: lockedConstraints(input.constraints),
    previousDecision: previousDecision(input.previousBrief),
    mutableFields: SOCIAL_DECISION_REBRIEF_MUTABLE_FIELDS,
  };
}
