import type { LearningDefinitionReference, PersonalLearningPlan } from '@bunshin/application';
import { AI_TRAINING_LEARNING_DEFINITION_FIXTURES } from '@bunshin/capability-training';

/** Presentation only: never replaces the Mission, Rubric, or execution permission. */
export type PersonalLearningFocus = Readonly<{
  title: string;
  focus: string;
  assessmentNote: string;
}>;

const focusByKey: Readonly<Record<string, PersonalLearningFocus>> = {
  PROMPT_STRUCTURE: {
    title: '指示の基本構造を確認する',
    focus:
      '今回は「背景・目的・依頼」を分けることに注目します。何のために、何をしてほしいかを整理しましょう。',
    assessmentNote: '課題では、指示の構造と背景の伝え方を一緒に確認します。',
  },
  CONTEXT_SETTING: {
    title: '必要な背景情報を選ぶ',
    focus:
      '前と同じ課題を使い、今回は「誰に向けた、どんな場面の依頼か」に注目します。目的に必要な背景だけを選びましょう。',
    assessmentNote: '背景だけでなく、目的・依頼を分けた指示の構造も引き続き確認します。',
  },
  CONSTRAINT_SETTING: {
    title: '具体的で矛盾しない条件を伝える',
    focus:
      '今回は「長さ・文体・注意点などの条件」に注目します。課題に沿って2つ以上の具体的な条件を加え、目的と矛盾しないか確認しましょう。',
    assessmentNote: '条件の指定と、必要な背景の伝え方を一緒に確認します。',
  },
};

export function resolvePersonalLearningFocus(
  plan: Pick<PersonalLearningPlan, 'status' | 'steps'> | undefined,
  assignment: {
    definitionReference?: LearningDefinitionReference | null;
    actionKey: string;
    planCompleted?: boolean;
  } | null,
): PersonalLearningFocus | null {
  const ref = assignment?.definitionReference;
  if (!ref || !plan || plan.status !== 'CONFIRMED' || assignment?.planCompleted) return null;
  const same = (other: LearningDefinitionReference) =>
    ref.packageKey === other.packageKey &&
    ref.definitionKey === other.definitionKey &&
    ref.version === other.version;
  const definition = AI_TRAINING_LEARNING_DEFINITION_FIXTURES.find((d) => same(d.reference));
  if (
    !definition ||
    assignment.actionKey !== definition.legacyMissionRef.actionKey ||
    !plan.steps.some((step) => same(step.definition))
  )
    return null;
  const focus = focusByKey[ref.definitionKey];
  return focus ? Object.freeze({ ...focus }) : null;
}
