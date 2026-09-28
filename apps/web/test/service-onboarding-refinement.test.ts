import { describe, expect, it } from 'vitest';
import {
  deferOnboardingRefinement,
  nextOnboardingRefinement,
  nextOnboardingRefinementAt,
  readOnboardingRefinementState,
} from '../src/services/service-onboarding-response';

const now = new Date('2026-09-28T12:00:00Z');
const day = 24 * 60 * 60 * 1000;
const questions = ['目的は？', '興味は？'];
const answers = questions.map((question) => ({ question, answer: 'まだ回答していません' }));

describe('onboarding refinement cadence', () => {
  it('waits exactly 24 hours after signup or saving, including across date boundaries', () => {
    const nextRefinementAt = nextOnboardingRefinementAt(now);
    expect(nextRefinementAt.toISOString()).toBe('2026-09-29T12:00:00.000Z');
    expect(nextOnboardingRefinement(questions, answers, { nextRefinementAt, now })).toBeNull();
    expect(
      nextOnboardingRefinement(questions, answers, { nextRefinementAt, now: nextRefinementAt })
        ?.index,
    ).toBe(0);
  });

  it('defers the same question for seven days even after reordering', () => {
    const state = deferOnboardingRefinement(questions, questions[0]!, {}, now);
    expect(
      nextOnboardingRefinement([...questions].reverse(), answers, { state, now })?.question,
    ).toBe(questions[1]);
    expect(
      nextOnboardingRefinement(questions, answers, {
        state,
        now: new Date(now.getTime() + 7 * day - 1),
      })?.index,
    ).toBe(1);
    expect(
      nextOnboardingRefinement(questions, answers, {
        state,
        now: new Date(now.getTime() + 7 * day),
      })?.index,
    ).toBe(0);
    expect(answers[0]?.answer).toBe('まだ回答していません');
  });

  it('does not extend a deadline or append history on duplicate requests', () => {
    const state = deferOnboardingRefinement(questions, questions[0]!, {}, now);
    expect(
      deferOnboardingRefinement(questions, questions[0]!, state, new Date(now.getTime() + day)),
    ).toEqual(state);
  });

  it('never prompts an answered question and handles all deferred or empty questions', () => {
    expect(
      nextOnboardingRefinement(['使うSNSは？'], [{ question: '使うSNSは？', answer: 'X' }], {
        now,
      }),
    ).toBeNull();
    expect(
      nextOnboardingRefinement(
        questions,
        questions.map((question) => ({ question, answer: '地域のお客様' })),
        { now },
      ),
    ).toBeNull();
    const state = questions.reduce(
      (value, question) => deferOnboardingRefinement(questions, question, value, now),
      readOnboardingRefinementState({}),
    );
    expect(nextOnboardingRefinement(questions, answers, { state, now })).toBeNull();
    expect(nextOnboardingRefinement([], [], { now })).toBeNull();
  });

  it('prunes removed and expired deferrals and bounds history to 20 events', () => {
    let state = readOnboardingRefinementState({});
    for (let index = 0; index < 30; index++) {
      state = deferOnboardingRefinement(
        ['question'],
        'question',
        state,
        new Date(now.getTime() + index * 8 * day),
      );
    }
    expect(state.history).toHaveLength(20);
    expect(state.deferred).toHaveLength(1);
    state = deferOnboardingRefinement(['new'], 'new', state, new Date(now.getTime() + 240 * day));
    expect(state.deferred.map((entry) => entry.question)).toEqual(['new']);
    expect(() => deferOnboardingRefinement([], 'removed', state, now)).toThrow();
    expect(JSON.stringify(state)).not.toContain('answer');
  });

  it('tolerates legacy and malformed metadata without copying arbitrary keys', () => {
    expect(readOnboardingRefinementState(null)).toEqual({ version: 1, deferred: [], history: [] });
    expect(
      readOnboardingRefinementState({
        deferred: [null, { question: 'bad', at: 'invalid', until: 'never' }],
      }).deferred,
    ).toEqual([]);
  });
});
