/** Rules for the first Manaberu learning-nudge phase. No learner text is classified here. */
export const PERSONAL_LEARNING_NUDGE_RULES = Object.freeze({
  timezone: 'Asia/Tokyo',
  windowStartHour: 9,
  windowEndHour: 20,
  minimumGapHours: 48,
  weeklyLimit: 2,
  responseWindowHours: 72,
  stalledFirstDays: [1, 3] as const,
  stuckPracticeDays: 3,
  stuckConsultationCount: 3,
  stuckFollowupDays: [1, 2] as const,
  inactiveLookbackDays: 14,
  inactiveMinimumActionDays: 3,
  inactiveNudgeDays: [4, 10] as const,
  completedFollowupDays: 2,
  silentFollowupDays: [14, 44] as const,
  perLearnerMonthlyUsdMicros: 500_000,
  perServiceMonthlyUsdMicros: 5_000_000,
  maxInputTokens: 1_000,
  maxOutputTokens: 200,
  maxMessageCharacters: 150,
} as const);

export const PERSONAL_LEARNING_NUDGE_PRIORITY = Object.freeze([
  'REST_RESUME',
  'STUCK',
  'NEW_LEARNER_STALLED',
  'PRACTICE_COMPLETE',
  'RETURN_INACTIVE',
  'NO_RESPONSE',
] as const);
export type PersonalLearningNudgeSituation = (typeof PERSONAL_LEARNING_NUDGE_PRIORITY)[number];

export const PERSONAL_LEARNING_NUDGE_FALLBACKS: Readonly<
  Record<PersonalLearningNudgeSituation, string>
> = Object.freeze({
  REST_RESUME: 'お休み明けですね。無理のない範囲で、テーマの続きを一歩だけ進めてみませんか？',
  STUCK:
    '止まっていても大丈夫です。前回の練習を小さく分けて、できそうなところから一緒に見てみましょう。',
  NEW_LEARNER_STALLED:
    '最初の一歩は小さくて大丈夫です。今気になっていることを一言だけ書くところから始めてみませんか？',
  PRACTICE_COMPLETE:
    'ここまで取り組めましたね。次のテーマを考えるのも、少し休むのも、ご自身のペースで大丈夫です。',
  RETURN_INACTIVE:
    '前回取り組んだところから、できそうな一歩だけ再開してみませんか？いつでもご自身のペースで大丈夫です。',
  NO_RESPONSE:
    'このメッセージでいったん声かけを終えます。学びたいと思ったときは、いつでも戻ってこられます。',
});

export const PERSONAL_LEARNING_NUDGE_PROMPT_VERSION = 'manaberu-learning-nudge-v1';

export interface NudgeLearnerAction {
  occurredAt: Date;
  kind:
    | 'WISH_SAVED'
    | 'PRACTICE_STARTED'
    | 'PRACTICE_REPORTED'
    | 'CONSULTATION'
    | 'CONVERSATION'
    | 'LINE_INBOUND';
}
export interface NudgePractice {
  id: string;
  title: string;
  startedAt: Date | null;
  reportedAt: Date | null;
  outcome: 'CAN_DO' | 'COULD_NOT' | 'STOPPED' | null;
}
export interface NudgeHistory {
  situation: PersonalLearningNudgeSituation;
  sentAt: Date;
  sourceKey: string | null;
  respondedAt: Date | null;
}
export interface NudgeContext {
  now: Date;
  enrollmentStartedAt: Date;
  actions: readonly NudgeLearnerAction[];
  hasSavedWish: boolean;
  wishSavedAt: Date | null;
  practices: readonly NudgePractice[];
  consultationCountsByPractice: Readonly<Record<string, number>>;
  thirdConsultationAtByPractice: Readonly<Record<string, Date>>;
  resumeAt: Date | null;
  histories: readonly NudgeHistory[];
}
export interface NudgeDecision {
  situation: PersonalLearningNudgeSituation;
  sourceKey: string | null;
  triggerAt: Date;
  ordinal: number;
}
const DAY = 86_400_000;
const daysSince = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / DAY);
const hoursSince = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 3_600_000;
function responded(history: NudgeHistory, now: Date) {
  return (
    history.respondedAt !== null &&
    hoursSince(history.respondedAt, history.sentAt) <=
      PERSONAL_LEARNING_NUDGE_RULES.responseWindowHours &&
    history.respondedAt <= now
  );
}

/** Select at most one deterministic situation. Callers must recheck consent, scope and LINE eligibility before delivery. */
export function decidePersonalLearningNudge(input: NudgeContext): NudgeDecision | null {
  const { now, histories } = input;
  const actions = [...input.actions]
    .filter((a) => a.occurredAt <= now)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const latestActionAt = actions[0]?.occurredAt ?? null;
  const latestPractice =
    [...input.practices].sort(
      (a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0),
    )[0] ?? null;
  const sentFor = (s: PersonalLearningNudgeSituation, key?: string | null) =>
    histories.filter((h) => h.situation === s && (key === undefined || h.sourceKey === key));
  const candidates: NudgeDecision[] = [];
  if (!input.hasSavedWish || input.practices.length === 0) {
    const count = sentFor('NEW_LEARNER_STALLED').length;
    const dueDay = PERSONAL_LEARNING_NUDGE_RULES.stalledFirstDays[count];
    const conditionAt = input.hasSavedWish
      ? (input.wishSavedAt ?? input.enrollmentStartedAt)
      : input.enrollmentStartedAt;
    if (dueDay && daysSince(now, conditionAt) >= dueDay)
      candidates.push({
        situation: 'NEW_LEARNER_STALLED',
        sourceKey: null,
        triggerAt: conditionAt,
        ordinal: count + 1,
      });
  }
  if (latestPractice && !latestPractice.reportedAt) {
    const stuckByAgeAt = latestPractice.startedAt
      ? new Date(
          latestPractice.startedAt.getTime() +
            PERSONAL_LEARNING_NUDGE_RULES.stuckPracticeDays * DAY,
        )
      : null;
    const stuckByConsultationAt =
      (input.consultationCountsByPractice[latestPractice.id] ?? 0) >=
      PERSONAL_LEARNING_NUDGE_RULES.stuckConsultationCount
        ? (input.thirdConsultationAtByPractice[latestPractice.id] ?? null)
        : null;
    const conditionAt = [stuckByAgeAt, stuckByConsultationAt]
      .filter((value): value is Date => value instanceof Date)
      .reduce<Date | null>(
        (earliest, value) => (!earliest || value < earliest ? value : earliest),
        null,
      );
    const followupDays = PERSONAL_LEARNING_NUDGE_RULES.stuckFollowupDays;
    if (
      conditionAt &&
      daysSince(now, conditionAt) >= followupDays[0] &&
      daysSince(now, conditionAt) <= followupDays[1] &&
      sentFor('STUCK', latestPractice.id).length === 0
    )
      candidates.push({
        situation: 'STUCK',
        sourceKey: latestPractice.id,
        triggerAt: conditionAt,
        ordinal: 1,
      });
  }
  if (
    latestPractice?.outcome &&
    ['CAN_DO', 'COULD_NOT', 'STOPPED'].includes(latestPractice.outcome) &&
    latestPractice.reportedAt
  ) {
    if (
      latestPractice.outcome === 'CAN_DO' &&
      daysSince(now, latestPractice.reportedAt) >=
        PERSONAL_LEARNING_NUDGE_RULES.completedFollowupDays &&
      !input.practices.some((p) => p.startedAt && p.startedAt > latestPractice.reportedAt!)
    ) {
      if (sentFor('PRACTICE_COMPLETE', latestPractice.id).length === 0)
        candidates.push({
          situation: 'PRACTICE_COMPLETE',
          sourceKey: latestPractice.id,
          triggerAt: latestPractice.reportedAt,
          ordinal: 1,
        });
    } else if (
      latestPractice.outcome !== 'CAN_DO' &&
      sentFor('STUCK', latestPractice.id).length === 0
    ) {
      candidates.push({
        situation: 'STUCK',
        sourceKey: latestPractice.id,
        triggerAt: latestPractice.reportedAt,
        ordinal: 1,
      });
    }
  }
  if (latestActionAt) {
    const activeDays = new Set(
      actions
        .filter(
          (a) => daysSince(now, a.occurredAt) < PERSONAL_LEARNING_NUDGE_RULES.inactiveLookbackDays,
        )
        .map((a) => a.occurredAt.toISOString().slice(0, 10)),
    ).size;
    const idleDays = daysSince(now, latestActionAt);
    const count = sentFor('RETURN_INACTIVE').length;
    const dueDay = PERSONAL_LEARNING_NUDGE_RULES.inactiveNudgeDays[count];
    if (
      activeDays >= PERSONAL_LEARNING_NUDGE_RULES.inactiveMinimumActionDays &&
      dueDay &&
      idleDays >= dueDay
    )
      candidates.push({
        situation: 'RETURN_INACTIVE',
        sourceKey: null,
        triggerAt: latestActionAt,
        ordinal: count + 1,
      });
  }
  if (input.resumeAt && now >= input.resumeAt && sentFor('REST_RESUME').length === 0)
    candidates.push({
      situation: 'REST_RESUME',
      sourceKey: null,
      triggerAt: input.resumeAt,
      ordinal: 1,
    });
  const orderedHistory = [...histories].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  const lastTwo = orderedHistory.slice(-2);
  if (
    lastTwo.length === 2 &&
    lastTwo.every(
      (h) =>
        now.getTime() - h.sentAt.getTime() >=
          PERSONAL_LEARNING_NUDGE_RULES.responseWindowHours * 3_600_000 && !responded(h, now),
    )
  ) {
    const noResponseHistory = sentFor('NO_RESPONSE');
    const count = noResponseHistory.length;
    const dueDay = PERSONAL_LEARNING_NUDGE_RULES.silentFollowupDays[count];
    const triggerAt = count === 0 ? lastTwo.at(-1)!.sentAt : noResponseHistory.at(-1)!.sentAt;
    if (dueDay && daysSince(now, triggerAt) >= dueDay)
      candidates.push({ situation: 'NO_RESPONSE', sourceKey: null, triggerAt, ordinal: count + 1 });
  }
  candidates.sort(
    (a, b) =>
      PERSONAL_LEARNING_NUDGE_PRIORITY.indexOf(a.situation) -
      PERSONAL_LEARNING_NUDGE_PRIORITY.indexOf(b.situation),
  );
  const chosen = candidates[0];
  if (!chosen) return null;
  const previous = histories.at(-1);
  if (previous && hoursSince(now, previous.sentAt) < PERSONAL_LEARNING_NUDGE_RULES.minimumGapHours)
    return null;
  const weekAgo = now.getTime() - 7 * DAY;
  if (
    histories.filter((h) => h.sentAt.getTime() >= weekAgo).length >=
    PERSONAL_LEARNING_NUDGE_RULES.weeklyLimit
  )
    return null;
  return chosen;
}

export function nudgeSendTimeJst(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PERSONAL_LEARNING_NUDGE_RULES.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const hour = Number(value['hour']);
  if (
    hour >= PERSONAL_LEARNING_NUDGE_RULES.windowStartHour &&
    hour < PERSONAL_LEARNING_NUDGE_RULES.windowEndHour
  )
    return now;
  const nextDay = hour >= PERSONAL_LEARNING_NUDGE_RULES.windowEndHour;
  const local = new Date(
    Date.UTC(
      Number(value['year']),
      Number(value['month']) - 1,
      Number(value['day']) + (nextDay ? 1 : 0),
      0,
      0,
    ),
  );
  return new Date(
    local.getTime() - 9 * 3_600_000 + PERSONAL_LEARNING_NUDGE_RULES.windowStartHour * 3_600_000,
  );
}
