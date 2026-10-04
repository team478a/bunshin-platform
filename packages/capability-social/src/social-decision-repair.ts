import { ApplicationError } from '@bunshin/shared';

import { MISSION_QUALITY_VERDICTS, type MissionQualityVerdict } from './mission-quality';

export const SOCIAL_DECISION_REPAIR_POLICY_VERSION = 'social-decision-repair-v1';
export const SOCIAL_DECISION_CONTENT_INSPECTION_ISSUES = [
  'INSTRUCTION_AS_POST',
  'EXACT_RECENT_CONTENT',
  'SUBSTANTIAL_RECENT_OVERLAP',
] as const;
export type SocialDecisionContentInspectionIssue =
  (typeof SOCIAL_DECISION_CONTENT_INSPECTION_ISSUES)[number];

interface SocialDecisionRepairDispositionBase {
  policyVersion: typeof SOCIAL_DECISION_REPAIR_POLICY_VERSION;
  currentDecisionStage: 'DAILY';
  qualityIssueCodes: string[];
  contentInspectionIssue: SocialDecisionContentInspectionIssue | null;
}

export type SocialDecisionRepairDisposition =
  | (SocialDecisionRepairDispositionBase & {
      action: 'KEEP_DECISION';
      reason: 'QUALITY_PASS';
      nextDecisionStage: null;
    })
  | (SocialDecisionRepairDispositionBase & {
      action: 'REBRIEF_REQUIRED';
      reason: 'QUALITY_REVISE' | 'CONTENT_INSPECTION_FAILED';
      nextDecisionStage: 'REVISED_BRIEF';
    })
  | (SocialDecisionRepairDispositionBase & {
      action: 'REJECT_CONTENT';
      reason: 'QUALITY_REJECT';
      nextDecisionStage: null;
    });

const qualityIssueCodes = (values: readonly string[]) => {
  const unique = [...new Set(values)];
  if (
    unique.length > 20 ||
    unique.some((value) => value.trim().length === 0 || value !== value.trim() || value.length > 80)
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid decision repair quality issue codes');
  return unique;
};

export function decideSocialDecisionRepair(input: {
  qualityVerdict: MissionQualityVerdict;
  qualityIssueCodes: readonly string[];
  contentInspectionIssue: SocialDecisionContentInspectionIssue | null;
}): SocialDecisionRepairDisposition {
  if (!MISSION_QUALITY_VERDICTS.includes(input.qualityVerdict))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid decision repair quality verdict');
  if (
    input.contentInspectionIssue !== null &&
    !SOCIAL_DECISION_CONTENT_INSPECTION_ISSUES.includes(input.contentInspectionIssue)
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid decision repair inspection issue');
  const base: SocialDecisionRepairDispositionBase = {
    policyVersion: SOCIAL_DECISION_REPAIR_POLICY_VERSION,
    currentDecisionStage: 'DAILY',
    qualityIssueCodes: qualityIssueCodes(input.qualityIssueCodes),
    contentInspectionIssue: input.contentInspectionIssue,
  };
  if (input.qualityVerdict === 'REJECT')
    return {
      ...base,
      action: 'REJECT_CONTENT',
      reason: 'QUALITY_REJECT',
      nextDecisionStage: null,
    };
  if (input.contentInspectionIssue !== null)
    return {
      ...base,
      action: 'REBRIEF_REQUIRED',
      reason: 'CONTENT_INSPECTION_FAILED',
      nextDecisionStage: 'REVISED_BRIEF',
    };
  if (input.qualityVerdict === 'REVISE')
    return {
      ...base,
      action: 'REBRIEF_REQUIRED',
      reason: 'QUALITY_REVISE',
      nextDecisionStage: 'REVISED_BRIEF',
    };
  return {
    ...base,
    action: 'KEEP_DECISION',
    reason: 'QUALITY_PASS',
    nextDecisionStage: null,
  };
}
