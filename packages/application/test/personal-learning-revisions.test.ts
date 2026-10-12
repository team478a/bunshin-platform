import { describe, expect, it } from 'vitest';
import { personalLearningRevisionFlags } from '../src/personal-learning-revisions';

describe('executable learning plan and proposal separation', () => {
  it('keeps confirmed practice current while a later proposal is prepared', () => {
    const rows = [
      { planId: 'a', revision: 1, status: 'CONFIRMED' },
      { planId: 'a', revision: 2, status: 'DRAFT' },
    ];
    expect(rows.map((row) => personalLearningRevisionFlags(rows, row))).toEqual([
      { isCurrent: true, isLatestProposal: false },
      { isCurrent: false, isLatestProposal: true },
    ]);
  });
  it('changes the executing revision only after confirmation, without mixing other plans', () => {
    const rows = [
      { planId: 'a', revision: 1, status: 'SUPERSEDED' },
      { planId: 'a', revision: 2, status: 'CONFIRMED' },
      { planId: 'b', revision: 9, status: 'DRAFT' },
    ];
    expect(personalLearningRevisionFlags(rows, rows[0]!)).toEqual({
      isCurrent: false,
      isLatestProposal: false,
    });
    expect(personalLearningRevisionFlags(rows, rows[1]!)).toEqual({
      isCurrent: true,
      isLatestProposal: false,
    });
    expect(personalLearningRevisionFlags(rows, rows[2]!)).toEqual({
      isCurrent: true,
      isLatestProposal: true,
    });
  });
  it('does not reinterpret completion as a new draft confirmation', () => {
    const rows = [
      { planId: 'a', revision: 1, status: 'COMPLETED' },
      { planId: 'a', revision: 2, status: 'DRAFT' },
    ];
    expect(personalLearningRevisionFlags(rows, rows[0]!).isCurrent).toBe(true);
    expect(personalLearningRevisionFlags(rows, rows[1]!).isCurrent).toBe(false);
  });
});
