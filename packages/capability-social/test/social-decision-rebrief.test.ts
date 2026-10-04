import { describe, expect, it } from 'vitest';

import type { DailyMissionBrief } from '../src/mission-generation';
import { decideSocialDecisionRepair } from '../src/social-decision-repair';
import {
  finalizeSocialDecisionRebrief,
  prepareSocialDecisionRebrief,
  type SocialDecisionRebriefOutput,
} from '../src/social-decision-rebrief';

const constraints = {
  missionDate: '2026-10-04',
  timezone: 'Asia/Tokyo',
  platform: 'INSTAGRAM' as const,
  currentGoal: 'INQUIRY' as const,
  strategyVersion: 3,
  weeklyGoal: '相談前の不安を減らす',
  weeklyAngle: '初回相談の流れ',
  format: 'SLIDE' as const,
  availableMinutes: 10 as const,
  campaignId: 'campaign-approved',
  classification: 'ADVERTISEMENT' as const,
};
const previousBrief: DailyMissionBrief = {
  missionDate: constraints.missionDate,
  socialProfileId: 'profile-internal',
  weeklyPlanItemId: 'weekly-item-internal',
  format: constraints.format,
  topic: '初回相談で確認すること',
  angle: '3つの確認事項',
  reason: '相談前の不安を減らすため',
  estimatedMinutes: 10,
  campaignId: constraints.campaignId,
  classification: constraints.classification,
  personalizationSourceTypes: ['ACCOUNT_STRATEGY'],
  personalizationReason: '現在の問い合わせ目的に沿うため',
};
const boundary = {
  authorization: 'PASSED' as const,
  capability: 'PASSED' as const,
  ownership: 'PASSED' as const,
  safetyLegal: 'PASSED' as const,
};
const disposition = decideSocialDecisionRepair({
  qualityVerdict: 'REVISE',
  qualityIssueCodes: ['GOAL_MISMATCH'],
  contentInspectionIssue: null,
});
const output: SocialDecisionRebriefOutput = {
  topic: '初回相談で最初に確認すること',
  angle: '当日の流れを時系列で説明する',
  reason: '問い合わせ前の不安を具体的に減らすため',
  estimatedMinutes: 10,
  personalizationSourceTypes: ['ACCOUNT_STRATEGY'],
  personalizationReason: '現在の問い合わせ目的を判断軸にしたため',
};

function prepare(brief: DailyMissionBrief = previousBrief) {
  return prepareSocialDecisionRebrief({
    attempt: 1,
    boundary,
    disposition,
    constraints,
    previousBrief: brief,
  });
}

describe('social decision rebrief input contract', () => {
  it('prepares one provider-safe revised brief attempt with locked decision constraints', () => {
    const prepared = prepareSocialDecisionRebrief({
      attempt: 1,
      boundary,
      disposition,
      constraints,
      previousBrief,
    });

    expect(prepared).toMatchObject({
      policyVersion: 'social-decision-rebrief-v1',
      decisionStage: 'REVISED_BRIEF',
      attempt: 1,
      maximumAttempts: 1,
      trigger: { reason: 'QUALITY_REVISE', qualityIssueCodes: ['GOAL_MISMATCH'] },
      lockedConstraints: {
        missionDate: constraints.missionDate,
        timezone: constraints.timezone,
        platform: constraints.platform,
        currentGoal: constraints.currentGoal,
        strategyVersion: constraints.strategyVersion,
        weeklyGoal: constraints.weeklyGoal,
        weeklyAngle: constraints.weeklyAngle,
        format: constraints.format,
        availableMinutes: constraints.availableMinutes,
        campaignAttached: true,
        trendUsed: false,
        classification: constraints.classification,
      },
      previousDecision: {
        topic: previousBrief.topic,
        angle: previousBrief.angle,
        personalizationSourceTypes: ['ACCOUNT_STRATEGY'],
      },
      mutableFields: [
        'topic',
        'angle',
        'reason',
        'estimatedMinutes',
        'personalizationSourceTypes',
        'personalizationReason',
      ],
    });
    expect(JSON.stringify(prepared)).not.toContain('profile-internal');
    expect(JSON.stringify(prepared)).not.toContain('weekly-item-internal');
    expect(JSON.stringify(prepared)).not.toContain('campaign-approved');
  });

  it.each(['authorization', 'capability', 'ownership', 'safetyLegal'] as const)(
    'fails closed when %s is unknown',
    (key) => {
      expect(() =>
        prepareSocialDecisionRebrief({
          attempt: 1,
          boundary: { ...boundary, [key]: 'UNKNOWN' },
          disposition,
          constraints,
          previousBrief,
        }),
      ).toThrow('decision rebrief boundary is not ready');
    },
  );

  it('does not allow a second rebrief attempt', () => {
    expect(() =>
      prepareSocialDecisionRebrief({
        attempt: 2,
        boundary,
        disposition,
        constraints,
        previousBrief,
      }),
    ).toThrow('decision rebrief attempt limit exceeded');
  });

  it('does not reinterpret a rejected decision as rebriefable', () => {
    expect(() =>
      prepareSocialDecisionRebrief({
        attempt: 1,
        boundary,
        disposition: decideSocialDecisionRepair({
          qualityVerdict: 'REJECT',
          qualityIssueCodes: ['UNSUPPORTED_CLAIM'],
          contentInspectionIssue: null,
        }),
        constraints,
        previousBrief,
      }),
    ).toThrow('decision disposition does not allow rebrief');
  });

  it.each([
    ['missionDate', { missionDate: '2026-10-05' }],
    ['format', { format: 'IMAGE' as const }],
    ['campaign', { campaignId: null }],
    ['classification', { classification: 'ORGANIC' as const }],
  ])('rejects a previous decision with changed %s', (_name, override) => {
    expect(() =>
      prepareSocialDecisionRebrief({
        attempt: 1,
        boundary,
        disposition,
        constraints: { ...constraints, ...override },
        previousBrief,
      }),
    ).toThrow('previous decision does not match rebrief constraints');
  });
});

describe('social decision rebrief finalize contract', () => {
  it('changes only the six mutable fields and preserves internal and locked references', () => {
    const briefWithTrend = { ...previousBrief, trendCandidateId: 'trend-internal' };
    const preparation = prepare(briefWithTrend);

    const finalized = finalizeSocialDecisionRebrief({
      preparation,
      previousBrief: briefWithTrend,
      output,
    });

    expect(finalized).toEqual({
      ...briefWithTrend,
      ...output,
    });
    expect(finalized.socialProfileId).toBe('profile-internal');
    expect(finalized.weeklyPlanItemId).toBe('weekly-item-internal');
    expect(finalized.campaignId).toBe('campaign-approved');
    expect(finalized.trendCandidateId).toBe('trend-internal');
    expect(finalized.format).toBe('SLIDE');
    expect(finalized.classification).toBe('ADVERTISEMENT');
  });

  it.each([
    ['mission date', { missionDate: '2026-10-05' }],
    ['format', { format: 'IMAGE' as const }],
    ['campaign attachment', { campaignAttached: false }],
    ['trend usage', { trendUsed: true }],
    ['classification', { classification: 'ORGANIC' as const }],
  ])('rejects preparation drift in locked %s', (_name, lockedOverride) => {
    const preparation = prepare();
    expect(() =>
      finalizeSocialDecisionRebrief({
        preparation: {
          ...preparation,
          lockedConstraints: { ...preparation.lockedConstraints, ...lockedOverride },
        },
        previousBrief,
        output,
      }),
    ).toThrow('decision rebrief preparation does not match brief');
  });

  it('rejects a preparation created for another previous decision', () => {
    const preparation = prepare();
    expect(() =>
      finalizeSocialDecisionRebrief({
        preparation,
        previousBrief: { ...previousBrief, topic: '別の元判断' },
        output,
      }),
    ).toThrow('decision rebrief preparation does not match brief');
  });

  it('rejects extra provider fields instead of spreading them over the brief', () => {
    const polluted = { ...output, format: 'IMAGE' } as SocialDecisionRebriefOutput;
    expect(() =>
      finalizeSocialDecisionRebrief({
        preparation: prepare(),
        previousBrief,
        output: polluted,
      }),
    ).toThrow('invalid decision rebrief output fields');
  });

  it('rejects an output that exceeds the locked time budget', () => {
    expect(() =>
      finalizeSocialDecisionRebrief({
        preparation: prepare(),
        previousBrief,
        output: { ...output, estimatedMinutes: 20 },
      }),
    ).toThrow('invalid decision rebrief estimated minutes');
  });

  it('rejects an unknown personalization source at the domain boundary', () => {
    expect(() =>
      finalizeSocialDecisionRebrief({
        preparation: prepare(),
        previousBrief,
        output: {
          ...output,
          personalizationSourceTypes: ['UNKNOWN_SOURCE'] as never[],
        },
      }),
    ).toThrow('invalid decision rebrief personalization sources');
  });
});
