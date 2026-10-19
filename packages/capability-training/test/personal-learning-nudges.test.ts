import { describe, expect, it } from 'vitest';
import {
  decidePersonalLearningNudge,
  nudgeSendTimeJst,
  PERSONAL_LEARNING_NUDGE_FALLBACKS,
  PERSONAL_LEARNING_NUDGE_NO_RESPONSE_REMINDER,
  PERSONAL_LEARNING_NUDGE_PRIORITY,
  personalLearningNudgeCopy,
} from '../src';

const d = (day: number, hour = 12) => new Date(Date.UTC(2026, 0, day, hour));
const base = (overrides: Partial<Parameters<typeof decidePersonalLearningNudge>[0]> = {}) => ({
  now: d(10),
  enrollmentStartedAt: d(1),
  actions: [],
  hasSavedWish: true,
  wishSavedAt: null,
  practices: [],
  consultationCountsByPractice: {},
  thirdConsultationAtByPractice: {},
  resumeAt: null,
  histories: [],
  ...overrides,
});

describe('Manaberu learning nudge rule engine', () => {
  it('detects new learners without wish/practice on day 1 and day 3 only', () => {
    expect(
      decidePersonalLearningNudge(base({ now: d(1), hasSavedWish: false }))?.situation,
    ).toBeUndefined();
    expect(decidePersonalLearningNudge(base({ now: d(2), hasSavedWish: false }))).toMatchObject({
      situation: 'NEW_LEARNER_STALLED',
      ordinal: 1,
    });
    const first = {
      situation: 'NEW_LEARNER_STALLED' as const,
      sentAt: d(2),
      sourceKey: null,
      respondedAt: null,
    };
    expect(
      decidePersonalLearningNudge(base({ now: d(4), hasSavedWish: false, histories: [first] })),
    ).toMatchObject({ situation: 'NEW_LEARNER_STALLED', ordinal: 2 });
    expect(
      decidePersonalLearningNudge(
        base({ now: d(4), hasSavedWish: false, histories: [first, { ...first, sentAt: d(4) }] }),
      ),
    ).toBeNull();
  });
  it('detects structured practice trouble but does not infer from unstructured notes', () => {
    const practice = {
      id: 'p1',
      title: 'practice',
      startedAt: d(1),
      reportedAt: null,
      outcome: null,
    };
    expect(decidePersonalLearningNudge(base({ practices: [practice], now: d(5) }))).toMatchObject({
      situation: 'STUCK',
      sourceKey: 'p1',
    });
    expect(
      decidePersonalLearningNudge(
        base({ practices: [{ ...practice, startedAt: null }], now: d(10) }),
      ),
    ).toBeNull();
    expect(
      decidePersonalLearningNudge(
        base({
          practices: [{ ...practice, startedAt: null }],
          consultationCountsByPractice: { p1: 3 },
          thirdConsultationAtByPractice: { p1: d(5) },
          now: d(6),
        }),
      ),
    ).toMatchObject({ situation: 'STUCK' });
    expect(
      decidePersonalLearningNudge(
        base({ practices: [{ ...practice, outcome: 'COULD_NOT', reportedAt: d(8) }] }),
      ),
    ).toMatchObject({ situation: 'STUCK' });
  });
  it('waits one to two days after the stuck condition is reached', () => {
    const practice = {
      id: 'p1',
      title: 'practice',
      startedAt: d(1),
      reportedAt: null,
      outcome: null,
    };
    expect(decidePersonalLearningNudge(base({ practices: [practice], now: d(4) }))).toBeNull();
    expect(decidePersonalLearningNudge(base({ practices: [practice], now: d(5) }))).toMatchObject({
      situation: 'STUCK',
    });
    expect(decidePersonalLearningNudge(base({ practices: [practice], now: d(7) }))).toBeNull();
  });
  it('detects a completed practice follow-up after two days', () => {
    expect(
      decidePersonalLearningNudge(
        base({
          practices: [
            { id: 'p1', title: 'done', startedAt: d(1), reportedAt: d(8), outcome: 'CAN_DO' },
          ],
        }),
      ),
    ).toMatchObject({ situation: 'PRACTICE_COMPLETE' });
  });
  it('requires three learner-action days in the 14-day lookback for inactivity', () => {
    const actions = [1, 3, 5].map((day) => ({ occurredAt: d(day), kind: 'CONVERSATION' as const }));
    const practice = [
      { id: 'p1', title: 'current', startedAt: d(9), reportedAt: null, outcome: null },
    ];
    expect(
      decidePersonalLearningNudge(base({ actions, practices: practice, now: d(9) })),
    ).toMatchObject({ situation: 'RETURN_INACTIVE' });
    expect(
      decidePersonalLearningNudge(
        base({ actions: actions.slice(0, 2), practices: practice, now: d(9) }),
      ),
    ).toBeNull();
  });
  it('selects only the highest priority situation and caps delivery', () => {
    const nudge = decidePersonalLearningNudge(base({ hasSavedWish: false, resumeAt: d(9) }));
    expect(nudge?.situation).toBe('REST_RESUME');
    expect(PERSONAL_LEARNING_NUDGE_PRIORITY).toEqual([
      'REST_RESUME',
      'STUCK',
      'NEW_LEARNER_STALLED',
      'PRACTICE_COMPLETE',
      'RETURN_INACTIVE',
      'NO_RESPONSE',
    ]);
    const sent = {
      situation: 'RETURN_INACTIVE' as const,
      sentAt: d(8),
      sourceKey: null,
      respondedAt: null,
    };
    expect(
      decidePersonalLearningNudge(base({ hasSavedWish: false, histories: [sent], now: d(9, 10) })),
    ).toBeNull();
  });
  it('calculates 09:00 JST windows and provides a fixed fallback for each situation', () => {
    const recentMessages = [1, 2].map((day) => ({
      situation: 'RETURN_INACTIVE' as const,
      sentAt: d(day),
      sourceKey: null,
      respondedAt: null,
    }));
    expect(decidePersonalLearningNudge(base({ now: d(4), histories: recentMessages }))).toBeNull();
    expect(nudgeSendTimeJst(new Date('2026-01-02T00:00:00.000Z')).toISOString()).toBe(
      '2026-01-02T00:00:00.000Z',
    );
    expect(nudgeSendTimeJst(new Date('2026-01-02T12:00:00.000Z')).toISOString()).toBe(
      '2026-01-03T00:00:00.000Z',
    );
    expect(Object.keys(PERSONAL_LEARNING_NUDGE_FALLBACKS)).toHaveLength(6);
  });

  it('sends one REST_RESUME per distinct pause expiry', () => {
    const firstResumeAt = d(3);
    const first = decidePersonalLearningNudge(
      base({ now: firstResumeAt, resumeAt: firstResumeAt }),
    );
    expect(first).toMatchObject({
      situation: 'REST_RESUME',
      sourceKey: firstResumeAt.toISOString(),
    });

    const secondResumeAt = d(10);
    const second = decidePersonalLearningNudge(
      base({
        now: secondResumeAt,
        resumeAt: secondResumeAt,
        histories: [
          {
            situation: 'REST_RESUME',
            sentAt: firstResumeAt,
            sourceKey: firstResumeAt.toISOString(),
            respondedAt: null,
          },
        ],
      }),
    );
    expect(second).toMatchObject({
      situation: 'REST_RESUME',
      sourceKey: secondResumeAt.toISOString(),
    });
    expect(
      decidePersonalLearningNudge(
        base({
          now: secondResumeAt,
          resumeAt: secondResumeAt,
          histories: [
            {
              situation: 'REST_RESUME',
              sentAt: firstResumeAt,
              sourceKey: firstResumeAt.toISOString(),
              respondedAt: null,
            },
            {
              situation: 'REST_RESUME',
              sentAt: secondResumeAt,
              sourceKey: secondResumeAt.toISOString(),
              respondedAt: null,
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('sends a gentle no-response message after 14 days and a final one 30 days later', () => {
    const history = [
      { situation: 'RETURN_INACTIVE' as const, sentAt: d(4), sourceKey: null, respondedAt: null },
      { situation: 'STUCK' as const, sentAt: d(6), sourceKey: 'p1', respondedAt: null },
    ];
    const activePractice = {
      id: 'p1',
      title: 'active',
      startedAt: d(1),
      reportedAt: null,
      outcome: null,
    };
    const first = decidePersonalLearningNudge(
      base({ now: d(20), histories: history, practices: [activePractice] }),
    );
    expect(first).toMatchObject({ situation: 'NO_RESPONSE', ordinal: 1 });
    expect(personalLearningNudgeCopy(first!.situation, first!.ordinal)).toBe(
      PERSONAL_LEARNING_NUDGE_NO_RESPONSE_REMINDER,
    );
    expect(PERSONAL_LEARNING_NUDGE_NO_RESPONSE_REMINDER).not.toContain('いったん声かけを終えます');

    const firstNoResponse = {
      situation: 'NO_RESPONSE' as const,
      sentAt: d(20),
      sourceKey: null,
      respondedAt: null,
    };
    const second = decidePersonalLearningNudge(
      base({ now: d(50), histories: [...history, firstNoResponse], practices: [activePractice] }),
    );
    expect(second).toMatchObject({ situation: 'NO_RESPONSE', ordinal: 2 });
    expect(personalLearningNudgeCopy(second!.situation, second!.ordinal)).toBe(
      PERSONAL_LEARNING_NUDGE_FALLBACKS.NO_RESPONSE,
    );

    const finalNoResponse = { ...firstNoResponse, sentAt: d(50) };
    const completedPractice = {
      id: 'completed-practice',
      title: 'completed',
      startedAt: d(1),
      reportedAt: d(2),
      outcome: 'CAN_DO' as const,
    };
    expect(
      decidePersonalLearningNudge(
        base({
          now: d(54),
          histories: [...history, firstNoResponse, finalNoResponse],
          practices: [completedPractice],
        }),
      ),
    ).toBeNull();
    expect(
      decidePersonalLearningNudge(
        base({
          now: d(54),
          histories: [...history, firstNoResponse, finalNoResponse],
          practices: [completedPractice],
          actions: [{ occurredAt: d(53), kind: 'CONVERSATION' }],
        }),
      )?.situation,
    ).toBe('PRACTICE_COMPLETE');

    // A direct reply is an explicit response, not a learning action, and can reopen nudges.
    expect(
      decidePersonalLearningNudge(
        base({
          now: d(54),
          histories: [
            ...history,
            firstNoResponse,
            { ...finalNoResponse, respondedAt: d(53) },
          ],
          practices: [completedPractice],
        }),
      )?.situation,
    ).toBe('PRACTICE_COMPLETE');
  });
});
