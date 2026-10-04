import { describe, expect, it } from 'vitest';

import type { DailyMissionBrief } from '../src/mission-generation';
import { decideSocialDecisionRepair } from '../src/social-decision-repair';
import { prepareSocialDecisionRebrief } from '../src/social-decision-rebrief';

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
