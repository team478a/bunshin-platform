import { ApplicationError } from '@bunshin/shared';

import { SOCIAL_DECISION_REBRIEF_MAX_ATTEMPTS } from './social-decision-rebrief';
import type {
  SocialDecisionRepairDisposition,
  SocialDecisionStage,
} from './social-decision-repair';

export const SOCIAL_DECISION_REBRIEF_ORCHESTRATION_POLICY_VERSION =
  'social-decision-rebrief-orchestration-v1';

export type SocialDecisionRebriefNextStep =
  | {
      policyVersion: typeof SOCIAL_DECISION_REBRIEF_ORCHESTRATION_POLICY_VERSION;
      action: 'ACCEPT_BRIEF';
      acceptedDecisionStage: SocialDecisionStage;
      rebriefAttemptsUsed: 0 | 1;
    }
  | {
      policyVersion: typeof SOCIAL_DECISION_REBRIEF_ORCHESTRATION_POLICY_VERSION;
      action: 'RUN_REBRIEF';
      nextDecisionStage: 'REVISED_BRIEF';
      rebriefAttempt: typeof SOCIAL_DECISION_REBRIEF_MAX_ATTEMPTS;
      trigger: SocialDecisionRepairDisposition & { action: 'REBRIEF_REQUIRED' };
    }
  | {
      policyVersion: typeof SOCIAL_DECISION_REBRIEF_ORCHESTRATION_POLICY_VERSION;
      action: 'FAIL_CLOSED';
      reason: 'INITIAL_CONTENT_REJECTED' | 'REBRIEF_ATTEMPT_FAILED';
      failedDecisionStage: SocialDecisionStage;
      rebriefAttemptsUsed: 0 | 1;
      finalDisposition: SocialDecisionRepairDisposition;
    };

/**
 * Chooses the next reBrief lifecycle step without calling providers, consuming quota or persisting.
 * A revised brief is terminal: it may be accepted or failed closed, but never revised again.
 */
export function decideSocialDecisionRebriefNextStep(input: {
  decisionStage: SocialDecisionStage;
  rebriefAttemptsUsed: 0 | 1;
  disposition: SocialDecisionRepairDisposition;
}): SocialDecisionRebriefNextStep {
  if (input.disposition.currentDecisionStage !== input.decisionStage)
    throw new ApplicationError('CONFLICT', 'decision repair stage does not match orchestration');
  if (
    (input.decisionStage === 'DAILY' && input.rebriefAttemptsUsed !== 0) ||
    (input.decisionStage === 'REVISED_BRIEF' &&
      input.rebriefAttemptsUsed !== SOCIAL_DECISION_REBRIEF_MAX_ATTEMPTS)
  )
    throw new ApplicationError('CONFLICT', 'invalid decision rebrief orchestration attempt');

  if (input.disposition.action === 'KEEP_DECISION')
    return {
      policyVersion: SOCIAL_DECISION_REBRIEF_ORCHESTRATION_POLICY_VERSION,
      action: 'ACCEPT_BRIEF',
      acceptedDecisionStage: input.decisionStage,
      rebriefAttemptsUsed: input.rebriefAttemptsUsed,
    };

  if (input.decisionStage === 'DAILY' && input.disposition.action === 'REBRIEF_REQUIRED')
    return {
      policyVersion: SOCIAL_DECISION_REBRIEF_ORCHESTRATION_POLICY_VERSION,
      action: 'RUN_REBRIEF',
      nextDecisionStage: 'REVISED_BRIEF',
      rebriefAttempt: SOCIAL_DECISION_REBRIEF_MAX_ATTEMPTS,
      trigger: structuredClone(input.disposition),
    };

  return {
    policyVersion: SOCIAL_DECISION_REBRIEF_ORCHESTRATION_POLICY_VERSION,
    action: 'FAIL_CLOSED',
    reason: input.decisionStage === 'DAILY' ? 'INITIAL_CONTENT_REJECTED' : 'REBRIEF_ATTEMPT_FAILED',
    failedDecisionStage: input.decisionStage,
    rebriefAttemptsUsed: input.rebriefAttemptsUsed,
    finalDisposition: structuredClone(input.disposition),
  };
}
