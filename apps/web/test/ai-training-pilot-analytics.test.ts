import { describe, expect, it } from 'vitest';
import { buildAiTrainingPilotAnalytics } from '../src/services/ai-training-pilot-analytics';

describe('AI training pilot analytics', () => {
  it('calculates the pilot funnel without counting the same participant twice', () => {
    const analytics = buildAiTrainingPilotAnalytics({
      enrollmentIds: ['a', 'b', 'c', 'c'],
      assessedEnrollmentIds: ['a', 'b'],
      goalEnrollmentIds: ['a'],
      presentedEnrollmentIds: ['a', 'b'],
      answers: [
        {
          programEnrollmentId: 'a',
          evaluatedAt: new Date('2026-09-01T00:00:00Z'),
          evaluation: { result: 'REVIEW', skills: { promptStructure: 40 } },
        },
        {
          programEnrollmentId: 'a',
          evaluatedAt: new Date('2026-09-02T00:00:00Z'),
          evaluation: { result: 'PASS', skills: { promptStructure: 75 } },
        },
        {
          programEnrollmentId: 'b',
          evaluatedAt: new Date('2026-09-02T00:00:00Z'),
          evaluation: { result: 'PASS', skills: { promptStructure: 70 } },
        },
      ],
      toolkitEnrollmentIds: ['a', 'a'],
    });

    expect(analytics.participants).toBe(3);
    expect(analytics.assessmentCompletionPercent).toBe(67);
    expect(analytics.goalSelectionPercent).toBe(50);
    expect(analytics.answerPercent).toBe(100);
    expect(analytics.passPercent).toBe(67);
    expect(analytics.retryPercent).toBe(100);
    expect(analytics.skillImprovementPercent).toBe(100);
    expect(analytics.toolkitSavePercent).toBe(50);
  });

  it('returns zero percentages for an empty pilot', () => {
    const analytics = buildAiTrainingPilotAnalytics({
      enrollmentIds: [],
      assessedEnrollmentIds: [],
      goalEnrollmentIds: [],
      presentedEnrollmentIds: [],
      answers: [],
      toolkitEnrollmentIds: [],
    });

    expect(analytics.assessmentCompletionPercent).toBe(0);
    expect(analytics.passPercent).toBe(0);
    expect(analytics.skillImprovementPercent).toBe(0);
  });
});
