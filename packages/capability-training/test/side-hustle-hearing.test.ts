import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import {
  SIDE_HUSTLE_HEARING_VERSION,
  sideHustleHearingReadyForProposal,
  validateSideHustleHearing,
  type SideHustleHearing,
} from '../src/side-hustle-hearing';

const empty = (): SideHustleHearing => ({
  conditions: {
    initialBudget: null,
    monthlyBudget: null,
    weeklyHours: null,
    faceExposure: null,
    snsPosting: null,
    clientInteraction: null,
    salesOutreach: null,
    inventory: null,
    device: null,
  },
  freeText: { goal: '得意なことを活かしたい', experience: null, interest: null, constraint: null },
  followUps: [],
});

describe('side hustle hearing', () => {
  it('accepts minimum, complete conditions, and eight follow-ups', () => {
    const base = empty();
    expect(validateSideHustleHearing(base).freeText.goal).toBe('得意なことを活かしたい');
    const full: SideHustleHearing = {
      ...empty(),
      conditions: {
        initialBudget: 'UNDER_10K',
        monthlyBudget: 'NONE',
        weeklyHours: 3,
        faceExposure: 'NG',
        snsPosting: 'OK',
        clientInteraction: 'NG',
        salesOutreach: 'OK',
        inventory: 'NG',
        device: 'PC',
      },
      followUps: Array.from({ length: 8 }, (_, i) => ({
        question: `質問${i}`,
        answer: `回答${i}`,
      })),
    };
    expect(validateSideHustleHearing(full).followUps).toHaveLength(8);
    expect(SIDE_HUSTLE_HEARING_VERSION).toBe('SIDE_HUSTLE_HEARING_V1');
  });

  it.each([
    ['extra key', { ...empty(), unexpected: true }],
    ['missing key', { ...empty(), freeText: { goal: null, experience: null, interest: null } }],
    ['overlong answer', { ...empty(), freeText: { ...empty().freeText, goal: 'a'.repeat(301) } }],
    ['empty answer', { ...empty(), freeText: { ...empty().freeText, goal: '' } }],
    ['trimmed answer', { ...empty(), freeText: { ...empty().freeText, goal: ' goal ' } }],
    ['invalid enum', { ...empty(), conditions: { ...empty().conditions, device: 'TABLET' } }],
    [
      'too many followups',
      { ...empty(), followUps: Array.from({ length: 9 }, () => ({ question: 'q', answer: 'a' })) },
    ],
  ])('rejects %s', (_label, value) => {
    expect(() => validateSideHustleHearing(value)).toThrow(ApplicationError);
  });

  it('requires only goal text before proposal', () => {
    expect(sideHustleHearingReadyForProposal(validateSideHustleHearing(empty()))).toBe(true);
    const noGoal = { ...empty(), freeText: { ...empty().freeText, goal: null } };
    expect(sideHustleHearingReadyForProposal(validateSideHustleHearing(noGoal))).toBe(false);
  });
});
