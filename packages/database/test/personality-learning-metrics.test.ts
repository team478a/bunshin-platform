import { describe, expect, it } from 'vitest';
import { summarizePersonalityLearning } from '../src';

describe('personality learning metrics', () => {
  it('separates decisions and counts repeated corrections only within one Bunshin', () => {
    expect(
      summarizePersonalityLearning([
        { bunshinId: 'a', status: 'APPROVED', reason: '短くする' },
        { bunshinId: 'a', status: 'REJECTED', reason: '短くする' },
        { bunshinId: 'b', status: 'REVOKED', reason: '短くする' },
        { bunshinId: 'a', status: 'PENDING', reason: '語調を変更' },
      ]),
    ).toEqual({
      proposed: 4,
      approved: 1,
      rejected: 1,
      revoked: 1,
      decided: 3,
      adoptionRate: 1 / 3,
      repeatedCorrectionCount: 1,
    });
  });

  it('keeps the adoption rate unknown before a decision exists', () => {
    expect(
      summarizePersonalityLearning([{ bunshinId: 'a', status: 'PENDING', reason: '短くする' }]),
    ).toMatchObject({ adoptionRate: null, decided: 0 });
  });
});
