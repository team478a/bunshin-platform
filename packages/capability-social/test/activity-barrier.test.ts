import { describe, expect, it } from 'vitest';
import {
  inferSocialActivityBarriers,
  type InferSocialActivityBarriersInput,
} from '../src/activity-barrier';

function input(
  metrics: Partial<InferSocialActivityBarriersInput['metrics']> = {},
): InferSocialActivityBarriersInput {
  return {
    scope: {
      workspaceId: 'workspace_1',
      serviceId: 'service_1',
      userId: 'user_1',
      bunshinId: 'bunshin_1',
    },
    observationWindow: {
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-08T00:00:00.000Z'),
      eligibleDays: 6,
      excludedSystemIncidentDays: 1,
    },
    metrics: {
      onboardingCompleted: true,
      lineDelivered: 0,
      missionViewed: 0,
      missionAccepted: 0,
      contentCopied: 0,
      postCompleted: 0,
      insightRecorded: 0,
      positiveResponseRecorded: 0,
      conversionActionRecorded: 0,
      ...metrics,
    },
  };
}

describe('inferSocialActivityBarriers', () => {
  it('returns only suspected candidates with auditable evidence', () => {
    const result = inferSocialActivityBarriers(input({ lineDelivered: 7, missionViewed: 1 }));

    expect(result.map((candidate) => candidate.category)).toEqual(['TIME', 'EFFORT', 'HOW_TO']);
    expect(result.every((candidate) => candidate.status === 'SUSPECTED')).toBe(true);
    expect(result[0]).toMatchObject({
      scope: { workspaceId: 'workspace_1', serviceId: 'service_1', bunshinId: 'bunshin_1' },
      evidence: {
        evidenceCode: 'DELIVERED_WITHOUT_VIEW',
        observationWindow: { eligibleDays: 6, excludedSystemIncidentDays: 1 },
        ruleVersion: 'social-activity-barrier-v1',
      },
    });
  });

  it.each([
    [{ missionViewed: 4 }, ['CONTENT', 'CONFIDENCE', 'HOW_TO']],
    [{ contentCopied: 3 }, ['TIME', 'EFFORT', 'MEDIA', 'CONFIDENCE']],
    [{ postCompleted: 2 }, ['UNKNOWN']],
    [{ postCompleted: 3, insightRecorded: 2 }, ['CONTENT', 'EFFECT']],
    [{ insightRecorded: 2, positiveResponseRecorded: 2 }, ['LEAD', 'RESPONSE']],
  ] satisfies Array<[Partial<InferSocialActivityBarriersInput['metrics']>, string[]]>)(
    'classifies representative activity funnel gaps',
    (metrics, expected) => {
      expect(
        inferSocialActivityBarriers(input(metrics)).map((candidate) => candidate.category),
      ).toEqual(expected);
    },
  );

  it('does not infer effect when performance measurement is missing', () => {
    const result = inferSocialActivityBarriers(input({ postCompleted: 5 }));

    expect(result.map((candidate) => candidate.category)).toEqual(['UNKNOWN']);
  });

  it('does not infer from a window containing no eligible observation days', () => {
    const value = input({ lineDelivered: 7 });
    value.observationWindow.eligibleDays = 0;
    value.observationWindow.excludedSystemIncidentDays = 7;

    expect(inferSocialActivityBarriers(value)).toEqual([]);
  });

  it('is deterministic and preserves the exact tenant and bunshin scope', () => {
    const first = input({ missionViewed: 6 });
    const second = structuredClone(first);
    second.scope = {
      workspaceId: 'workspace_2',
      serviceId: 'service_2',
      userId: 'user_2',
      bunshinId: 'bunshin_2',
    };

    expect(inferSocialActivityBarriers(first)).toEqual(inferSocialActivityBarriers(first));
    expect(inferSocialActivityBarriers(second)[0]?.scope).toEqual(second.scope);
    expect(inferSocialActivityBarriers(first)[0]?.scope).toEqual(first.scope);
  });

  it('rejects invalid metrics and observation windows', () => {
    expect(() => inferSocialActivityBarriers(input({ missionViewed: -1 }))).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );

    const invalidWindow = input();
    invalidWindow.observationWindow.to = invalidWindow.observationWindow.from;
    expect(() => inferSocialActivityBarriers(invalidWindow)).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });
});
