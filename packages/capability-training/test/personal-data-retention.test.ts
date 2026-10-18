import { describe, expect, it } from 'vitest';
import {
  personalLearningDynamicContentDeletionDue,
  personalLearningDynamicImageDeletionDue,
  personalLearningDynamicSummaryDeletionDue,
  trainingAnswerRetentionCutoff,
  trainingEndRetentionEligibility,
  trainingRetentionEndDate,
} from '../src';

describe('training retention policy', () => {
  it('keeps actively used dynamic learning content and deletes at the exact inactivity anniversary', () => {
    const lastUse = new Date('2024-02-29T15:00:00Z');
    expect(
      personalLearningDynamicContentDeletionDue({
        endedAt: null,
        lastLearnerUseAt: lastUse,
        now: new Date('2025-02-28T14:59:59.999Z'),
      }),
    ).toBe(false);
    expect(
      personalLearningDynamicContentDeletionDue({
        endedAt: null,
        lastLearnerUseAt: lastUse,
        now: new Date('2025-02-28T15:00:00Z'),
      }),
    ).toBe(true);
  });
  it('uses whichever comes first: end+90d or one-year inactivity', () => {
    const now = new Date('2026-10-17T00:00:00Z');
    expect(
      personalLearningDynamicContentDeletionDue({
        endedAt: new Date('2026-07-19T00:00:00Z'),
        lastLearnerUseAt: new Date('2026-10-01T00:00:00Z'),
        now,
      }),
    ).toBe(true);
    expect(
      personalLearningDynamicContentDeletionDue({
        endedAt: null,
        lastLearnerUseAt: new Date('2026-10-01T00:00:00Z'),
        now,
      }),
    ).toBe(false);
  });
  it('expires dynamic images at 90 days regardless of current activity', () => {
    const createdAt = new Date('2026-07-19T00:00:00Z');
    expect(
      personalLearningDynamicImageDeletionDue(createdAt, new Date('2026-10-16T23:59:59.999Z')),
    ).toBe(false);
    expect(
      personalLearningDynamicImageDeletionDue(createdAt, new Date('2026-10-17T00:00:00Z')),
    ).toBe(true);
  });
  it('retains structured summaries until end+1y or two years of inactivity', () => {
    expect(
      personalLearningDynamicSummaryDeletionDue({
        endedAt: null,
        lastLearnerUseAt: new Date('2024-02-29T15:00:00Z'),
        now: new Date('2026-02-28T15:00:00Z'),
      }),
    ).toBe(true);
    expect(
      personalLearningDynamicSummaryDeletionDue({
        endedAt: new Date('2025-10-18T00:00:00Z'),
        lastLearnerUseAt: new Date('2026-10-01T00:00:00Z'),
        now: new Date('2026-10-17T00:00:00Z'),
      }),
    ).toBe(false);
  });
  it('uses the recorded actual end for completed and cancelled training, never a planned date', () => {
    const endsAt = new Date('2027-01-01');
    const recordedEnd = new Date('2026-09-28');
    expect(trainingRetentionEndDate({ status: 'COMPLETED', endsAt, recordedEnd })).toBe(
      recordedEnd,
    );
    expect(trainingRetentionEndDate({ status: 'CANCELLED', endsAt, recordedEnd: null })).toBeNull();
  });
  it('ignores stale end records while training is active', () => {
    expect(
      trainingRetentionEndDate({
        status: 'ACTIVE',
        endsAt: new Date('2025-01-01'),
        recordedEnd: new Date('2025-01-01'),
      }),
    ).toBeNull();
  });
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
