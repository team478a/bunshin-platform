import { describe, expect, it } from 'vitest';
import { buildPerformanceFeedbackSummary } from '../src/services/performance-feedback-summary';

describe('performance feedback summary', () => {
  it('calculates feedback coverage without exposing individual records', () => {
    expect(buildPerformanceFeedbackSummary({ posted: 5, good: 2, neutral: 1, bad: 0 })).toEqual({
      posted: 5,
      good: 2,
      neutral: 1,
      bad: 0,
      rated: 3,
      unrated: 2,
      coveragePercent: 60,
      needsAttention: false,
    });
  });

  it('flags low coverage only after enough posts exist', () => {
    expect(
      buildPerformanceFeedbackSummary({ posted: 3, good: 1, neutral: 0, bad: 0 }).needsAttention,
    ).toBe(true);
    expect(
      buildPerformanceFeedbackSummary({ posted: 2, good: 0, neutral: 0, bad: 0 }).needsAttention,
    ).toBe(false);
  });
});
