import { describe, expect, it } from 'vitest';
import {
  buildSocialActivityBarrierQuestion,
  socialActivitySupportFor,
} from '../src/activity-barrier-support';
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
      thresholds: { minimumDelivered: 5, maximumViewed: 1 },
      ruleVersion: 'social-activity-barrier-v1',
    },
  };
}

describe('social activity barrier confirmation', () => {
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
});
