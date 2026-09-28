import { describe, expect, it } from 'vitest';
import { trainingAnswerRetentionCutoff, trainingEndRetentionEligibility } from '../src';

describe('training retention policy', () => {
  it('uses an exact 90-day answer cutoff without changing the supplied clock', () => {
    const now = new Date('2026-09-28T12:34:56.789Z');
    expect(trainingAnswerRetentionCutoff(now).toISOString()).toBe('2026-06-30T12:34:56.789Z');
    expect(now.toISOString()).toBe('2026-09-28T12:34:56.789Z');
  });
  it('includes the exact work-information deadline, but not one millisecond before', () => {
    const ended = new Date('2026-06-30T00:00:00Z');
    expect(
      trainingEndRetentionEligibility(ended, new Date('2026-09-27T23:59:59.999Z'))
        .workInformationDue,
    ).toBe(false);
    expect(
      trainingEndRetentionEligibility(ended, new Date('2026-09-28T00:00:00Z')).workInformationDue,
    ).toBe(true);
  });
  it('uses the calendar-year anniversary and clamps leap day to February 28', () => {
    const ended = new Date('2024-02-29T15:00:00Z');
    expect(
      trainingEndRetentionEligibility(ended, new Date('2025-02-28T14:59:59.999Z'))
        .progressAndScoresDue,
    ).toBe(false);
    expect(
      trainingEndRetentionEligibility(ended, new Date('2025-02-28T15:00:00Z')).progressAndScoresDue,
    ).toBe(true);
    expect(ended.toISOString()).toBe('2024-02-29T15:00:00.000Z');
  });
  it.each([null, new Date('invalid'), new Date('2027-01-01')])(
    'fails closed for an unconfirmed end date',
    (ended) => {
      expect(trainingEndRetentionEligibility(ended, new Date('2026-09-28'))).toEqual({
        workInformationDue: false,
        progressAndScoresDue: false,
        endDateKnown: false,
      });
    },
  );
  it('rejects an invalid reference clock', () => {
    expect(() => trainingAnswerRetentionCutoff(new Date('invalid'))).toThrow(
      'Invalid retention clock',
    );
  });
});
