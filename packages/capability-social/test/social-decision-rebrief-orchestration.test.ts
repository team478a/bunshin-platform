import { describe, expect, it } from 'vitest';

import { decideSocialDecisionRebriefNextStep } from '../src/social-decision-rebrief-orchestration';
import { decideSocialDecisionRepair } from '../src/social-decision-repair';

const disposition = (
  decisionStage: 'DAILY' | 'REVISED_BRIEF',
  qualityVerdict: 'PASS' | 'REVISE' | 'REJECT',
) =>
  decideSocialDecisionRepair({
    currentDecisionStage: decisionStage,
    qualityVerdict,
    qualityIssueCodes: qualityVerdict === 'PASS' ? [] : ['GOAL_MISMATCH'],
    contentInspectionIssue: null,
  });

describe('social decision rebrief orchestration', () => {
  it('accepts an initial brief that passes quality', () => {
    expect(
      decideSocialDecisionRebriefNextStep({
        decisionStage: 'DAILY',
        rebriefAttemptsUsed: 0,
        disposition: disposition('DAILY', 'PASS'),
      }),
    ).toEqual({
      policyVersion: 'social-decision-rebrief-orchestration-v1',
      action: 'ACCEPT_BRIEF',
      acceptedDecisionStage: 'DAILY',
      rebriefAttemptsUsed: 0,
    });
  });

  it('allows exactly one rebrief after a revisable initial decision', () => {
    expect(
      decideSocialDecisionRebriefNextStep({
        decisionStage: 'DAILY',
        rebriefAttemptsUsed: 0,
        disposition: disposition('DAILY', 'REVISE'),
      }),
    ).toMatchObject({
      action: 'RUN_REBRIEF',
      nextDecisionStage: 'REVISED_BRIEF',
      rebriefAttempt: 1,
      trigger: { action: 'REBRIEF_REQUIRED', currentDecisionStage: 'DAILY' },
    });
  });

  it('fails closed on an initially rejected decision', () => {
    expect(
      decideSocialDecisionRebriefNextStep({
        decisionStage: 'DAILY',
        rebriefAttemptsUsed: 0,
        disposition: disposition('DAILY', 'REJECT'),
      }),
    ).toMatchObject({
      action: 'FAIL_CLOSED',
      reason: 'INITIAL_CONTENT_REJECTED',
      failedDecisionStage: 'DAILY',
      rebriefAttemptsUsed: 0,
    });
  });

  it('accepts a revised brief only after it passes quality', () => {
    expect(
      decideSocialDecisionRebriefNextStep({
        decisionStage: 'REVISED_BRIEF',
        rebriefAttemptsUsed: 1,
        disposition: disposition('REVISED_BRIEF', 'PASS'),
      }),
    ).toMatchObject({
      action: 'ACCEPT_BRIEF',
      acceptedDecisionStage: 'REVISED_BRIEF',
      rebriefAttemptsUsed: 1,
    });
  });

  it.each(['REVISE', 'REJECT'] as const)(
    'fails closed without a second rebrief when the revised brief is %s',
    (qualityVerdict) => {
      expect(
        decideSocialDecisionRebriefNextStep({
          decisionStage: 'REVISED_BRIEF',
          rebriefAttemptsUsed: 1,
          disposition: disposition('REVISED_BRIEF', qualityVerdict),
        }),
      ).toMatchObject({
        action: 'FAIL_CLOSED',
        reason: 'REBRIEF_ATTEMPT_FAILED',
        failedDecisionStage: 'REVISED_BRIEF',
        rebriefAttemptsUsed: 1,
      });
    },
  );

  it('fails closed when revised content still duplicates recent content', () => {
    const revisedDuplicate = decideSocialDecisionRepair({
      currentDecisionStage: 'REVISED_BRIEF',
      qualityVerdict: 'PASS',
      qualityIssueCodes: [],
      contentInspectionIssue: 'EXACT_RECENT_CONTENT',
    });
    expect(
      decideSocialDecisionRebriefNextStep({
        decisionStage: 'REVISED_BRIEF',
        rebriefAttemptsUsed: 1,
        disposition: revisedDuplicate,
      }),
    ).toMatchObject({
      action: 'FAIL_CLOSED',
      reason: 'REBRIEF_ATTEMPT_FAILED',
      finalDisposition: { reason: 'CONTENT_INSPECTION_FAILED' },
    });
  });

  it('rejects inconsistent stage and attempt state', () => {
    expect(() =>
      decideSocialDecisionRebriefNextStep({
        decisionStage: 'DAILY',
        rebriefAttemptsUsed: 1,
        disposition: disposition('DAILY', 'PASS'),
      }),
    ).toThrow('invalid decision rebrief orchestration attempt');
  });

  it('rejects a repair disposition from another decision stage', () => {
    expect(() =>
      decideSocialDecisionRebriefNextStep({
        decisionStage: 'REVISED_BRIEF',
        rebriefAttemptsUsed: 1,
        disposition: disposition('DAILY', 'PASS'),
      }),
    ).toThrow('decision repair stage does not match orchestration');
  });
});
