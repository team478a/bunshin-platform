import { decideSocialDecisionRepair } from '@bunshin/capability-social';
import { describe, expect, it, vi } from 'vitest';

import { runDailyMissionRebriefGeneration } from '../src/services/daily-mission-rebrief-runtime';

type RuntimeInput = Parameters<typeof runDailyMissionRebriefGeneration>[0];

const initialBrief = {
  output: {
    missionDate: '2026-10-04',
    socialProfileId: 'profile-internal',
    weeklyPlanItemId: 'weekly-item-internal',
    format: 'SLIDE',
    topic: '相談前に知ること',
    angle: '3つの準備',
    reason: '問い合わせ前の不安を減らすため',
    estimatedMinutes: 10,
    campaignId: null,
    classification: 'ORGANIC',
    personalizationSourceTypes: ['ACCOUNT_STRATEGY'],
    personalizationReason: '問い合わせ目的に沿うため',
  },
  model: 'planner-model',
  promptVersion: 'daily-planner-v1',
  inputTokens: 100,
  outputTokens: 40,
  latencyMs: 10,
  planningContext: {
    missionDate: '2026-10-04',
    timezone: 'Asia/Tokyo',
    platform: 'INSTAGRAM',
    availableMinutes: 10,
    approvedStrategy: { goal: 'INQUIRY' },
    weeklyItem: {
      goal: '相談前の不安を減らす',
      angle: '初回相談の流れ',
    },
  },
} as unknown as RuntimeInput['initialBrief'];

const disposition = decideSocialDecisionRepair({
  qualityVerdict: 'REVISE',
  qualityIssueCodes: ['GOAL_MISMATCH'],
  contentInspectionIssue: null,
}) as RuntimeInput['disposition'];

const passedBoundary = {
  authorization: 'PASSED',
  capability: 'PASSED',
  ownership: 'PASSED',
  safetyLegal: 'PASSED',
} as const;

describe('daily mission rebrief runtime', () => {
  it('uses one quota/usage suffix and returns a bounded revision snapshot draft', async () => {
    const quotaSuffixes: string[] = [];
    const recordUsage = vi.fn().mockResolvedValue(undefined);
    const setStage = vi.fn();
    const planner = {
      generate: vi.fn().mockResolvedValue({
        output: {
          topic: '初回相談で確認すること',
          angle: '当日の流れを時系列で説明する',
          reason: '問い合わせ前の不安を具体的に減らすため',
          estimatedMinutes: 10,
          personalizationSourceTypes: ['ACCOUNT_STRATEGY'],
          personalizationReason: '現在の問い合わせ目的を判断軸にしたため',
        },
        model: 'rebrief-model',
        promptVersion: 'daily-mission-rebrief-v1',
        inputTokens: 80,
        outputTokens: 30,
        latencyMs: 8,
      }),
    };

    const result = await runDailyMissionRebriefGeneration({
      apiKey: 'not-used-by-fake',
      model: 'configured-model',
      initialBrief,
      strategyVersion: 3,
      boundary: passedBoundary,
      disposition,
      generateWithQuota: async (suffix, generate) => {
        quotaSuffixes.push(suffix);
        return generate();
      },
      recordUsage,
      setStage,
      planner,
    });

    expect(planner.generate).toHaveBeenCalledTimes(1);
    expect(quotaSuffixes).toEqual(['decision-rebrief:1']);
    expect(recordUsage).toHaveBeenCalledWith(
      'decision-rebrief:1',
      'DAILY_MISSION_REBRIEF',
      expect.objectContaining({ promptVersion: 'daily-mission-rebrief-v1' }),
    );
    expect(setStage).toHaveBeenCalledWith('decision-rebrief:1');
    expect(result.brief.output).toMatchObject({
      socialProfileId: 'profile-internal',
      weeklyPlanItemId: 'weekly-item-internal',
      topic: '初回相談で確認すること',
    });
    expect(result.revision).toMatchObject({
      attempt: 1,
      maximumAttempts: 1,
      trigger: { reason: 'QUALITY_REVISE', qualityIssueCodes: ['GOAL_MISMATCH'] },
      initialPlannerModel: 'planner-model',
      rebriefModel: 'rebrief-model',
    });
    expect(result.revision.revisionOfDecisionRef).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.revision.decisionRef).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.revision.decisionRef).not.toBe(result.revision.revisionOfDecisionRef);
    expect(JSON.stringify(result.revision)).not.toContain('相談前に知ること');
  });

  it('rejects UNKNOWN safety before quota or provider execution', async () => {
    const generateWithQuota = vi.fn();
    const planner = { generate: vi.fn() };

    await expect(
      runDailyMissionRebriefGeneration({
        apiKey: 'not-used',
        model: 'model',
        initialBrief,
        strategyVersion: 3,
        boundary: { ...passedBoundary, safetyLegal: 'UNKNOWN' },
        disposition,
        generateWithQuota,
        recordUsage: vi.fn(),
        setStage: vi.fn(),
        planner,
      }),
    ).rejects.toThrow('decision rebrief boundary is not ready');
    expect(generateWithQuota).not.toHaveBeenCalled();
    expect(planner.generate).not.toHaveBeenCalled();
  });
});
