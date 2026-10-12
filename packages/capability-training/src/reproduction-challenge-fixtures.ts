import { AI_TRAINING_LEARNING_DEFINITION_FIXTURES } from './learning-definition-fixtures';
import {
  defineReproductionChallengeReference,
  REPRODUCTION_CHALLENGE_CONTRACT_VERSION,
  REPRODUCTION_CHALLENGE_VERSION,
  REPRODUCTION_SUBJECT_VERSION,
} from './reproduction-challenge-reference';

const subjects = [
  {
    subjectKey: 'EMAIL_PRACTICE' as const,
    scenario: '架空の社内勉強会の日程を、架空の担当者へ知らせるメールを題材にする。',
    facts: ['開催は11月10日15時、仮会議室A', '返信期限は11月5日', '出席者数・個人名は不明'],
  },
  {
    subjectKey: 'REPORT_PRACTICE' as const,
    scenario: '架空の備品整理の進み具合を、架空の担当者へ知らせる報告文を題材にする。',
    facts: ['対象は10件、整理済みは8件', '残り2件の状況は未確認', '完了予定・作業効果は不明'],
  },
  {
    subjectKey: 'INFORMATION_SUMMARY_PRACTICE' as const,
    scenario: '架空の図書室の案内を、初めて利用する架空のスタッフ向けに整理する。',
    facts: ['開室は火曜・木曜13時から16時', '利用対象はスタッフ', '予約は不要、貸出期間は不明'],
  },
];
const tasks: Readonly<Record<string, string>> = Object.freeze({
  PROMPT_STRUCTURE: '背景・目的・依頼を区別したAIへの指示を本人が組み立てる。依頼は一つに絞る。',
  CONTEXT_SETTING:
    '目的に必要な背景・対象を本人が選び、合成事実と不明な点を区別した指示を組み立てる。',
  CONSTRAINT_SETTING:
    '対象・長さ・文体・注意点から二つ以上を本人が選び、数値化できる条件を具体化する。',
});

/** Human review drafts only. Never present these through a Runtime without a separately reviewed bridge. */
export const REPRODUCTION_CHALLENGE_REVIEW_FIXTURES = Object.freeze(
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES.flatMap((definition) =>
    subjects.map((subject) => {
      const task = tasks[definition.reference.definitionKey];
      if (!task) throw new Error('missing reproduction challenge task');
      return Object.freeze({
        reference: defineReproductionChallengeReference({
          contractVersion: REPRODUCTION_CHALLENGE_CONTRACT_VERSION,
          subjectKey: subject.subjectKey,
          subjectVersion: REPRODUCTION_SUBJECT_VERSION,
          challengeKey: `${definition.reference.definitionKey}_${subject.subjectKey}`,
          challengeVersion: REPRODUCTION_CHALLENGE_VERSION,
          definition: definition.reference,
          legacyMissionRef: definition.legacyMissionRef,
        }),
        reviewStatus: 'DRAFT' as const,
        scenario: subject.scenario,
        syntheticFacts: Object.freeze([...subject.facts]),
        learnerTask: task,
        safetyBoundary: Object.freeze([
          '合成情報だけを使う。実在の顧客情報・個人情報・業務秘密を追加しない。',
          '本人がAIへの指示を作り、AIの出力を確認・必要なら修正する。研修は完成品を返さない。',
          '不明な情報を創作しない。本人の完成申告とPrompt評価を成果物品質・習得Levelと同一視しない。',
        ]),
      });
    }),
  ),
);

/** Review lookup, not an approval source. Strictly matches every pinned reference field. */
export function findReproductionChallengeReviewFixture(input: unknown) {
  const reference = defineReproductionChallengeReference(input);
  const identity = JSON.stringify(reference);
  return (
    REPRODUCTION_CHALLENGE_REVIEW_FIXTURES.find(
      (fixture) => JSON.stringify(fixture.reference) === identity,
    ) ?? null
  );
}

/** Fail closed even for known drafts. No caller-supplied reviewed/approved flag is accepted. */
export function resolveReproductionChallengeReference(input: unknown) {
  if (input === null || input === undefined)
    return Object.freeze({
      status: 'UNKNOWN' as const,
      reason: 'CHALLENGE_REFERENCE_MISSING' as const,
    });
  const fixture = findReproductionChallengeReviewFixture(input);
  return Object.freeze({
    status: 'UNKNOWN' as const,
    reason: fixture ? ('HUMAN_REVIEW_REQUIRED' as const) : ('CHALLENGE_REFERENCE_UNKNOWN' as const),
  });
}
