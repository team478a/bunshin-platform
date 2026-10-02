import { describe, expect, it } from 'vitest';
import {
  buildSocialActivityBarrierLineMessage,
  buildSocialActivityBarrierQuestion,
  selectSocialActivitySupport,
  socialActivitySupportFor,
} from '../src/activity-barrier-support';
import {
  buildSocialActivityBarrierGoalAttribution,
  buildSocialActivityBarrierGoalMetrics,
} from '../src/activity-barrier';
import type { SocialActivityBarrierCase } from '../src/activity-barrier-persistence';

function barrierCase(
  id: string,
  category: SocialActivityBarrierCase['category'],
): SocialActivityBarrierCase {
  return {
    id,
    scope: {
      workspaceId: 'workspace_1',
      serviceId: 'service_1',
      groupMembershipId: 'membership_1',
      userId: 'user_1',
      bunshinId: 'bunshin_1',
    },
    category,
    status: 'SUSPECTED',
    ruleVersion: 'social-activity-barrier-v1',
    recurrenceCount: 1,
    firstDetectedAt: new Date('2026-09-01T00:00:00.000Z'),
    lastDetectedAt: new Date('2026-09-08T00:00:00.000Z'),
    nextEligibleAt: null,
    evidence: {
      evidenceCode: 'DELIVERED_WITHOUT_VIEW',
      observationWindow: {
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-08T00:00:00.000Z',
        eligibleDays: 7,
        excludedSystemIncidentDays: 0,
      },
      metrics: { lineDelivered: 7, missionViewed: 0 },
      goalAttribution: null,
      goalMetrics: null,
      thresholds: { minimumDelivered: 5, maximumViewed: 1 },
      ruleVersion: 'social-activity-barrier-v1',
    },
  };
}

describe('social activity barrier confirmation', () => {
  it('builds a short LINE entry message without exposing inferred barrier categories', () => {
    const message = buildSocialActivityBarrierLineMessage({
      serviceName: 'ワタシワークス',
      confirmationUrl: 'https://example.com/s/service/bunshins/bunshin-1',
    });
    expect(message).toContain('今の状況を確認する1問');
    expect(message).toContain('https://example.com/s/service/bunshins/bunshin-1');
    expect(message).not.toContain('時間がない');
  });
  it('groups ambiguous candidates into one plain-language question', () => {
    const result = buildSocialActivityBarrierQuestion([
      barrierCase('case_1', 'TIME'),
      barrierCase('case_2', 'EFFORT'),
      barrierCase('case_3', 'HOW_TO'),
    ]);

    expect(result.caseIds).toEqual(['case_1', 'case_2', 'case_3']);
    expect(result.options.map((value) => value.label)).toEqual([
      '取り組む時間がない',
      '作業の負担が大きい',
      '操作や進め方が分からない',
    ]);
    expect(result.noneLabel).toBe('今はどれにも当てはまらない');
  });

  it('rejects candidates from different evidence windows', () => {
    const other = barrierCase('case_2', 'EFFORT');
    other.evidence.observationWindow.to = '2026-09-09T00:00:00.000Z';

    expect(() =>
      buildSocialActivityBarrierQuestion([barrierCase('case_1', 'TIME'), other]),
    ).toThrow('barrier cases must share one evidence scope');
  });

  it('maps every confirmed category to free support', () => {
    expect(socialActivitySupportFor('TIME')).toMatchObject({ key: 'FIVE_MINUTE_ACTION' });
    expect(socialActivitySupportFor('UNKNOWN')).toMatchObject({ key: 'MEASUREMENT_SETUP' });
  });

  it.each([
    {
      name: 'legacy evidence',
      attribution: null,
      reason: 'ATTRIBUTION_UNAVAILABLE',
    },
    {
      name: 'no observed missions',
      attribution: buildSocialActivityBarrierGoalAttribution([]),
      reason: 'NO_OBSERVED_MISSIONS',
    },
    {
      name: 'unattributed missions',
      attribution: buildSocialActivityBarrierGoalAttribution(['INQUIRY', null]),
      reason: 'UNATTRIBUTED_MISSIONS',
    },
    {
      name: 'mixed goals',
      attribution: buildSocialActivityBarrierGoalAttribution(['INQUIRY', 'RECRUIT']),
      reason: 'MIXED_GOALS',
    },
  ])('keeps common support for $name', ({ attribution, reason }) => {
    const value = barrierCase('case_1', 'TIME');
    value.evidence.goalAttribution = attribution;

    expect(
      selectSocialActivitySupport({ category: value.category, evidence: value.evidence }),
    ).toMatchObject({
      support: { key: 'FIVE_MINUTE_ACTION' },
      mode: 'COMMON',
      eligibleGoal: null,
      fallbackReason: reason,
    });
  });

  it('exposes a single fully attributed goal without selecting unconfigured goal copy', () => {
    const value = barrierCase('case_1', 'LEAD');
    value.evidence.goalAttribution = buildSocialActivityBarrierGoalAttribution([
      'INQUIRY',
      'INQUIRY',
    ]);
    value.evidence.goalMetrics = buildSocialActivityBarrierGoalMetrics(
      [
        {
          goal: 'INQUIRY',
          postCompleted: true,
          positiveResponseRecorded: true,
          conversionActionRecorded: false,
        },
      ],
      { insightRecorded: 0, positiveResponseRecorded: 0 },
    );

    expect(
      selectSocialActivitySupport({ category: value.category, evidence: value.evidence }),
    ).toMatchObject({
      support: { key: 'LEAD_FOLLOW_UP' },
      mode: 'COMMON',
      eligibleGoal: 'INQUIRY',
      fallbackReason: 'GOAL_SPECIFIC_SUPPORT_NOT_CONFIGURED',
    });
  });

  it('keeps common support when account-level insights cannot be assigned to a goal', () => {
    const value = barrierCase('case_1', 'EFFECT');
    value.evidence.goalAttribution = buildSocialActivityBarrierGoalAttribution(['INQUIRY']);
    value.evidence.goalMetrics = buildSocialActivityBarrierGoalMetrics(
      [
        {
          goal: 'INQUIRY',
          postCompleted: true,
          positiveResponseRecorded: false,
          conversionActionRecorded: false,
        },
      ],
      { insightRecorded: 1, positiveResponseRecorded: 1 },
    );

    expect(
      selectSocialActivitySupport({ category: value.category, evidence: value.evidence }),
    ).toMatchObject({
      mode: 'COMMON',
      eligibleGoal: null,
      fallbackReason: 'UNATTRIBUTED_ACCOUNT_METRICS',
    });
  });
});
