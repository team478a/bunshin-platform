import { describe, expect, it } from 'vitest';
import { summarizePersonalityLearning, summarizePersonalityLearningOutcomes } from '../src';

describe('personality learning metrics', () => {
  it('separates decisions and counts repeated corrections only within one Bunshin', () => {
    expect(
      summarizePersonalityLearning([
        { bunshinId: 'a', status: 'APPROVED', reason: '短くする' },
        { bunshinId: 'a', status: 'REJECTED', reason: '短くする' },
        { bunshinId: 'b', status: 'REVOKED', reason: '短くする' },
        { bunshinId: 'a', status: 'PENDING', reason: '語調を変更' },
      ]),
    ).toMatchObject({
      proposed: 4,
      approved: 1,
      rejected: 1,
      revoked: 1,
      decided: 3,
      adoptionRate: 1 / 3,
      repeatedCorrectionCount: 1,
    });
  });

  it('compares unique missions in the 30 days before and after learning', () => {
    const appliedAt = new Date('2026-09-01T00:00:00Z');
    const mission = (
      id: string,
      createdAt: string,
      posted: boolean,
      rating: 'GOOD' | 'BAD' | 'NEUTRAL' | null,
    ) => ({
      id,
      bunshinId: 'a',
      createdAt: new Date(createdAt),
      posted,
      rating,
    });
    expect(
      summarizePersonalityLearningOutcomes(
        [{ bunshinId: 'a', appliedAt }],
        [
          mission('before-1', '2026-08-20T00:00:00Z', true, 'BAD'),
          mission('before-2', '2026-08-25T00:00:00Z', false, 'GOOD'),
          mission('after-1', '2026-09-02T00:00:00Z', true, 'GOOD'),
          mission('after-2', '2026-09-03T00:00:00Z', true, null),
          { ...mission('other', '2026-09-03T00:00:00Z', true, 'GOOD'), bunshinId: 'b' },
        ],
      ),
    ).toEqual({
      before: {
        missions: 2,
        posted: 1,
        postRate: 0.5,
        feedback: 2,
        goodFeedback: 1,
        goodFeedbackRate: 0.5,
      },
      after: {
        missions: 2,
        posted: 2,
        postRate: 1,
        feedback: 1,
        goodFeedback: 1,
        goodFeedbackRate: 1,
      },
    });
  });

  it('keeps the adoption rate unknown before a decision exists', () => {
    expect(
      summarizePersonalityLearning([{ bunshinId: 'a', status: 'PENDING', reason: '短くする' }]),
    ).toMatchObject({ adoptionRate: null, decided: 0 });
  });
});
