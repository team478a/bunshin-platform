import { describe, expect, it } from 'vitest';

import {
  SOCIAL_DECISION_CONTENT_INSPECTION_ISSUES,
  decideSocialDecisionRepair,
} from '../src/social-decision-repair';

describe('social decision repair policy', () => {
  it('keeps a passed and inspected decision without creating a revision', () => {
    expect(
      decideSocialDecisionRepair({
        qualityVerdict: 'PASS',
        qualityIssueCodes: [],
        contentInspectionIssue: null,
      }),
    ).toEqual({
      policyVersion: 'social-decision-repair-v1',
      currentDecisionStage: 'DAILY',
      action: 'KEEP_DECISION',
      reason: 'QUALITY_PASS',
      nextDecisionStage: null,
      qualityIssueCodes: [],
      contentInspectionIssue: null,
    });
  });

  it('requires a revised brief instead of silently repairing a revisable decision', () => {
    expect(
      decideSocialDecisionRepair({
        qualityVerdict: 'REVISE',
        qualityIssueCodes: ['GOAL_MISMATCH'],
        contentInspectionIssue: null,
      }),
    ).toMatchObject({
      action: 'REBRIEF_REQUIRED',
      reason: 'QUALITY_REVISE',
      currentDecisionStage: 'DAILY',
      nextDecisionStage: 'REVISED_BRIEF',
      qualityIssueCodes: ['GOAL_MISMATCH'],
    });
  });

  it.each(SOCIAL_DECISION_CONTENT_INSPECTION_ISSUES)(
    'requires a revised brief for content inspection issue %s',
    (contentInspectionIssue) => {
      expect(
        decideSocialDecisionRepair({
          qualityVerdict: 'PASS',
          qualityIssueCodes: [],
          contentInspectionIssue,
        }),
      ).toMatchObject({
        action: 'REBRIEF_REQUIRED',
        reason: 'CONTENT_INSPECTION_FAILED',
        nextDecisionStage: 'REVISED_BRIEF',
        contentInspectionIssue,
      });
    },
  );

  it('rejects unsafe content without proposing a decision revision', () => {
    expect(
      decideSocialDecisionRepair({
        qualityVerdict: 'REJECT',
        qualityIssueCodes: ['UNSUPPORTED_CLAIM'],
        contentInspectionIssue: null,
      }),
    ).toMatchObject({
      action: 'REJECT_CONTENT',
      reason: 'QUALITY_REJECT',
      nextDecisionStage: null,
    });
  });

  it('normalizes repeated issue codes without duplicating audit metadata', () => {
    expect(
      decideSocialDecisionRepair({
        qualityVerdict: 'REVISE',
        qualityIssueCodes: ['GOAL_MISMATCH', 'GOAL_MISMATCH'],
        contentInspectionIssue: null,
      }),
    ).toMatchObject({ qualityIssueCodes: ['GOAL_MISMATCH'] });
  });

  it('rejects inspection values outside the versioned contract', () => {
    expect(() =>
      decideSocialDecisionRepair({
        qualityVerdict: 'PASS',
        qualityIssueCodes: [],
        contentInspectionIssue: 'UNKNOWN' as 'EXACT_RECENT_CONTENT',
      }),
    ).toThrow('invalid decision repair inspection issue');
  });
});
