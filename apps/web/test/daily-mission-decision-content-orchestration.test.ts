import { ApplicationError } from '@bunshin/shared';
import { describe, expect, it, vi } from 'vitest';

import { runDailyMissionDecisionContentOrchestration } from '../src/services/daily-mission-decision-content-orchestration';

const initialBrief = {
  output: { topic: '最初の企画' },
  model: 'planner-model',
  promptVersion: 'planner-v1',
} as never;
const revisedBrief = {
  output: { topic: '改訂した企画' },
  model: 'rebrief-model',
  promptVersion: 'rebrief-v1',
} as never;
const boundary = {
  authorization: 'PASSED',
  capability: 'PASSED',
  ownership: 'PASSED',
  safetyLegal: 'PASSED',
} as const;
const disposition = {
  policyVersion: 'social-decision-repair-v1',
  currentDecisionStage: 'DAILY',
  qualityIssueCodes: ['GOAL_MISMATCH'],
  contentInspectionIssue: null,
  action: 'REBRIEF_REQUIRED',
  reason: 'QUALITY_REVISE',
  nextDecisionStage: 'REVISED_BRIEF',
} as const;
const rebriefRequired = new ApplicationError('CONTENT_REJECTED', 'rebrief required', {
  reason: 'DECISION_REBRIEF_REQUIRED',
  decisionRepair: disposition,
  rebriefNextStep: {
    action: 'RUN_REBRIEF',
    nextDecisionStage: 'REVISED_BRIEF',
    rebriefAttempt: 1,
  },
});
const passedContent = {
  quality: { output: { verdict: 'PASS', issues: [] } },
} as never;
const revision = {
  schemaVersion: 1,
  policyVersion: 'social-decision-rebrief-v1',
  orchestrationPolicyVersion: 'social-decision-rebrief-orchestration-v1',
  attempt: 1,
  maximumAttempts: 1,
  revisionOfDecisionRef: `sha256:${'a'.repeat(64)}`,
  decisionRef: `sha256:${'b'.repeat(64)}`,
  trigger: {
    reason: 'QUALITY_REVISE',
    qualityIssueCodes: ['GOAL_MISMATCH'],
    contentInspectionIssue: null,
  },
  initialPlannerModel: 'planner-model',
  initialPlannerPromptVersion: 'planner-v1',
  rebriefModel: 'rebrief-model',
  rebriefPlannerPromptVersion: 'rebrief-v1',
} as const;

describe('daily mission decision content orchestration', () => {
  it('keeps the initial brief when the first content attempt passes', async () => {
    const prepareContent = vi.fn().mockResolvedValue({ brief: 'initial' });
    const generateContent = vi.fn().mockResolvedValue(passedContent);
    const reviseBrief = vi.fn();

    const result = await runDailyMissionDecisionContentOrchestration({
      initialBrief,
      decisionBoundary: boundary,
      prepareContent,
      generateContent,
      reviseBrief,
    });

    expect(result).toMatchObject({ brief: initialBrief, revision: null });
    expect(generateContent).toHaveBeenCalledWith(
      { brief: 'initial' },
      { decisionStage: 'DAILY', rebriefAttemptsUsed: 0, operationPrefix: undefined },
    );
    expect(reviseBrief).not.toHaveBeenCalled();
  });

  it('runs exactly one rebrief, rebuilds preparation and records final quality metadata', async () => {
    const prepareContent = vi
      .fn()
      .mockResolvedValueOnce({ brief: 'initial' })
      .mockResolvedValueOnce({ brief: 'revised' });
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(rebriefRequired)
      .mockResolvedValueOnce(passedContent);
    const reviseBrief = vi.fn().mockResolvedValue({ brief: revisedBrief, revision });

    const result = await runDailyMissionDecisionContentOrchestration({
      initialBrief,
      decisionBoundary: boundary,
      prepareContent,
      generateContent,
      reviseBrief,
    });

    expect(reviseBrief).toHaveBeenCalledTimes(1);
    expect(prepareContent).toHaveBeenCalledTimes(2);
    expect(generateContent).toHaveBeenNthCalledWith(
      2,
      { brief: 'revised' },
      {
        decisionStage: 'REVISED_BRIEF',
        rebriefAttemptsUsed: 1,
        operationPrefix: 'rebrief:1',
      },
    );
    expect(result).toMatchObject({
      brief: revisedBrief,
      revision: {
        attempt: 1,
        maximumAttempts: 1,
        finalQuality: { verdict: 'PASS', issueCodes: [] },
      },
    });
  });

  it('propagates the revised fail-closed result without a second rebrief', async () => {
    const finalFailure = new ApplicationError('CONTENT_REJECTED', 'final failure', {
      reason: 'DECISION_REBRIEF_FAILED',
      category: 'DECISION_REBRIEF_FAILED',
    });
    const prepareContent = vi.fn().mockResolvedValue({});
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(rebriefRequired)
      .mockRejectedValueOnce(finalFailure);
    const reviseBrief = vi.fn().mockResolvedValue({ brief: revisedBrief, revision });

    await expect(
      runDailyMissionDecisionContentOrchestration({
        initialBrief,
        decisionBoundary: boundary,
        prepareContent,
        generateContent,
        reviseBrief,
      }),
    ).rejects.toBe(finalFailure);
    expect(reviseBrief).toHaveBeenCalledTimes(1);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('does not rebrief when no trusted decision boundary is available', async () => {
    const reviseBrief = vi.fn();
    await expect(
      runDailyMissionDecisionContentOrchestration({
        initialBrief,
        decisionBoundary: null,
        prepareContent: vi.fn().mockResolvedValue({}),
        generateContent: vi.fn().mockRejectedValue(rebriefRequired),
        reviseBrief,
      }),
    ).rejects.toBe(rebriefRequired);
    expect(reviseBrief).not.toHaveBeenCalled();
  });

  it('does not accept a forged second rebrief request from the revised stage', async () => {
    const repeated = new ApplicationError('CONTENT_REJECTED', 'invalid second rebrief', {
      reason: 'DECISION_REBRIEF_REQUIRED',
      decisionRepair: { ...disposition, currentDecisionStage: 'REVISED_BRIEF' },
      rebriefNextStep: {
        action: 'RUN_REBRIEF',
        nextDecisionStage: 'REVISED_BRIEF',
        rebriefAttempt: 1,
      },
    });
    const reviseBrief = vi.fn();

    await expect(
      runDailyMissionDecisionContentOrchestration({
        initialBrief,
        decisionBoundary: boundary,
        prepareContent: vi.fn().mockResolvedValue({}),
        generateContent: vi.fn().mockRejectedValue(repeated),
        reviseBrief,
      }),
    ).rejects.toBe(repeated);
    expect(reviseBrief).not.toHaveBeenCalled();
  });
});
