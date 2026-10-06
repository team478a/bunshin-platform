import {
  defineLearnerScope,
  defineLearnerProfileProjection,
  defineLearningDefinitionReference,
  defineLearningGoalCandidate,
  LEARNING_CONSULTATION_CONTRACT_VERSION,
  LEARNING_CONSULTATION_MAX_QUESTIONS,
  PERSONAL_LEARNING_PROFILE_GOAL_CONTRACT_VERSION,
  type LearnerScope,
  type LearnerProfileProjection,
  type LearningConsultationRequest,
  type LearningConsultationQuestion,
  type LearningConsultationResult,
  type LearningDefinitionReference,
} from '@bunshin/application';
import {
  classifyAiTrainingLearningScope,
  AI_TRAINING_LEARNING_SCOPE_MAX_INPUT_CHARS,
} from './learning-scope';
import {
  AI_TRAINING_PROFILE_PROJECTION_VERSION,
  defineAiTrainingExperience,
  aiTrainingGoalSemanticReference,
  type AiTrainingProfileProjection,
} from './learning-profile-goal';
import { AI_TRAINING_LEARNING_CATALOG_VERSION } from './learning-catalog';
import { AI_TRAINING_LEARNING_DEFINITION_FIXTURES } from './learning-definition-fixtures';

export const AI_TRAINING_CONSULTATION_RULE_VERSION = 'AI_TRAINING_CONSULTATION_V1';
export interface AiTrainingConsultationContext {
  /** Server-resolved learner identity; do not accept this context from user JSON. */
  readonly scope: LearnerScope;
  readonly learner: LearnerProfileProjection;
  readonly aiTraining: AiTrainingProfileProjection;
  /** Trusted, human-reviewed, exact-version references. Fixtures do NOT imply approval. */
  readonly approvedDefinitionRefs?: readonly LearningDefinitionReference[];
}
const topicRequests = {
  PROMPT: 'プロンプトを学びたい',
  STRUCTURE: 'プロンプトの構造を学びたい',
  CONTEXT: 'プロンプトの背景設定を学びたい',
  CONSTRAINT: 'プロンプトの条件指定を学びたい',
  IMAGE: '画像生成を学びたい',
  AUTOMATION: '自動化の仕組みを学びたい',
  AGENT: 'AIエージェントについて学びたい',
} as const;
type Topic = keyof typeof topicRequests;
function invalid(): never {
  throw new Error('invalid learning consultation contract');
}
function sameScope(left: LearnerScope, right: LearnerScope) {
  return (
    left.workspaceId === right.workspaceId &&
    left.groupId === right.groupId &&
    left.programEnrollmentId === right.programEnrollmentId &&
    left.groupMembershipId === right.groupMembershipId &&
    left.userId === right.userId
  );
}
function question(
  key: string,
  text: string,
  options: readonly (readonly [string, string])[],
): LearningConsultationQuestion {
  return Object.freeze({
    key,
    text,
    options: Object.freeze(options.map(([key, label]) => Object.freeze({ key, label }))),
  });
}
const topicQuestion = question('LEARNING_TOPIC', 'AIでどんなことができるようになりたいですか？', [
  ['PROMPT', 'AIへの指示を組み立てる'],
  ['STRUCTURE', '指示の構造を学ぶ'],
  ['CONTEXT', '必要な背景を伝える'],
  ['CONSTRAINT', '条件を指定する'],
  ['IMAGE', '画像生成を学ぶ（学習設計準備中）'],
  ['AUTOMATION', '自動化の仕組みを学ぶ（学習設計準備中）'],
  ['AGENT', 'AIエージェントを学ぶ（学習設計準備中）'],
  ['CANCEL', '今は選ばない'],
]);
const experienceQuestion = question('AI_EXPERIENCE', '生成AIに指示を入力した経験はありますか？', [
  ['NONE', 'まだない'],
  ['SOME', '使ったことがある'],
  ['UNKNOWN', '分からない・回答しない'],
]);
const goalQuestion = question(
  'GOAL_CONFIRMATION',
  'この学習目標を選びますか？（保存・実行はまだ行いません）',
  [
    ['YES', 'これを学ぶ'],
    ['NO', '今は選ばない'],
  ],
);
const refKey = (ref: LearningDefinitionReference) =>
  `${ref.packageKey}:${ref.definitionKey}:${ref.version}`;
function topicFor(text: string): Topic | null {
  if (/画像/.test(text)) return 'IMAGE';
  if (/自動化/.test(text)) return 'AUTOMATION';
  if (/エージェント/.test(text)) return 'AGENT';
  if (/動画|API|Excel/i.test(text)) return null;
  const explicitPrompt =
    /^(?:プロンプト|ChatGPT)(?:の(?:構造|背景設定|文脈設定|条件指定|制約設定))?(?:を|について)(?:学びたい|勉強したい|習得したい|上手くなりたい)[。！？!?]*$/i;
  if (!explicitPrompt.test(text)) return null;
  if (/条件|制約/.test(text)) return 'CONSTRAINT';
  if (/背景|文脈/.test(text)) return 'CONTEXT';
  if (/構造/.test(text)) return 'STRUCTURE';
  return 'PROMPT';
}
function conversionRequest(text: string, automation: boolean) {
  if (automation) return topicRequests.AUTOMATION;
  if (/画像/.test(text)) return topicRequests.IMAGE;
  if (/動画/.test(text)) return '動画生成を学びたい';
  // A new, explicit learning selection, never the original Suggestion or a business Goal.
  return topicRequests.PROMPT;
}

/** Pure bounded replay. No persistence, approval operation, teaching, or Runtime invocation. */
export function consultAiTrainingLearning(
  context: AiTrainingConsultationContext,
  input: LearningConsultationRequest,
): LearningConsultationResult {
  const scope = defineLearnerScope(context.scope);
  if (
    !sameScope(scope, defineLearnerScope(input.scope)) ||
    !sameScope(scope, defineLearnerScope(context.learner.scope)) ||
    !sameScope(scope, defineLearnerScope(context.aiTraining.scope))
  )
    invalid();
  const learner = defineLearnerProfileProjection(context.learner);
  if (context.learner.contractVersion !== PERSONAL_LEARNING_PROFILE_GOAL_CONTRACT_VERSION)
    invalid();
  if (
    context.aiTraining.contractVersion !== AI_TRAINING_PROFILE_PROJECTION_VERSION ||
    !['UNKNOWN', 'BEGINNER', 'INTERMEDIATE'].includes(context.aiTraining.aiLevel)
  )
    invalid();
  const experience = defineAiTrainingExperience(context.aiTraining.aiExperience);
  if (
    typeof input.text !== 'string' ||
    !input.text.trim() ||
    input.text.length > AI_TRAINING_LEARNING_SCOPE_MAX_INPUT_CHARS
  )
    invalid();
  const answers = input.answers;
  if (!Array.isArray(input.answers) || input.answers.length > LEARNING_CONSULTATION_MAX_QUESTIONS)
    invalid();
  const approvedRefs = context.approvedDefinitionRefs ?? [];
  if (approvedRefs.length > 3) invalid();
  const approved = new Set(
    approvedRefs.map((ref) => refKey(defineLearningDefinitionReference(ref))),
  );
  if (approved.size !== approvedRefs.length) invalid();
  let answerIndex = 0;
  let questionCount = 0;
  let text = input.text.normalize('NFKC').trim();
  const classify = (request: string) =>
    classifyAiTrainingLearningScope({
      text: request,
      hasCurrentAiLearningContext: learner.currentPrimaryGoalRef?.status === 'ACTIVE',
    });
  let scopeDecision = classify(text);
  let learningRequest: string | null = null;
  const base = () =>
    ({
      contractVersion: LEARNING_CONSULTATION_CONTRACT_VERSION,
      ruleVersion: AI_TRAINING_CONSULTATION_RULE_VERSION,
      scope,
      scopeDecision,
      learningRequest,
      questionCount,
    }) as const;
  const finish = (result: LearningConsultationResult): LearningConsultationResult => {
    if (answerIndex !== answers.length) invalid();
    return Object.freeze(result);
  };
  const ask = (pending: LearningConsultationQuestion): string | null => {
    questionCount += 1;
    if (questionCount > LEARNING_CONSULTATION_MAX_QUESTIONS) invalid();
    const answer = answers[answerIndex];
    if (!answer) return null;
    if (
      Object.keys(answer).some((key) => !['questionKey', 'answerKey', 'candidateKey'].includes(key))
    )
      invalid();
    if (
      answer.questionKey !== pending.key ||
      !pending.options.some((option) => option.key === answer.answerKey) ||
      answer.candidateKey !== pending.candidateKey
    )
      invalid();
    answerIndex += 1;
    return answer.answerKey;
  };
  if (
    scopeDecision.reason === 'BOUNDARY_BYPASS' ||
    scopeDecision.reason === 'MIXED_INTENTS' ||
    (scopeDecision.reason === 'AMBIGUOUS_OR_UNRECOGNIZED' &&
      scopeDecision.detectedClassifications.length > 0) ||
    scopeDecision.detectedClassifications.length > 1
  ) {
    return finish({ ...base(), status: 'SCOPE_REVIEW_REQUIRED' });
  }
  if (
    scopeDecision.classification === 'CONSULTING' ||
    scopeDecision.classification === 'OUT_OF_SCOPE'
  ) {
    return finish({ ...base(), status: 'OUTSIDE_SCOPE' });
  }
  if (scopeDecision.classification === 'LEARNING_SUPPORT' && !scopeDecision.requiresConfirmation) {
    return finish({ ...base(), status: 'LEARNING_SUPPORT' });
  }
  if (scopeDecision.reason === 'LEARNING_SUGGESTION_REQUIRES_CONFIRMATION') {
    const automation = scopeDecision.classification === 'AUTOMATION_REQUEST';
    const conversion = question(
      'LEARNING_CONVERSION',
      automation
        ? '自動化を実行するのではなく、仕組みや必要な技術を学びますか？'
        : '成果物を制作するのではなく、AIを使って自分で作り、確認する方法を学びますか？',
      [
        ['YES', '学ぶ方法を選ぶ'],
        ['NO', '今は選ばない'],
      ],
    );
    const answer = ask(conversion);
    if (answer === null) return finish({ ...base(), status: 'ASKING', question: conversion });
    if (answer === 'NO') return finish({ ...base(), status: 'DECLINED' });
    text = conversionRequest(text, automation);
    scopeDecision = classify(text);
  } else if (scopeDecision.requiresConfirmation || scopeDecision.classification !== 'LEARNING') {
    // Explicit topic selection is a NEW learning request, not guessed intent from ambiguity.
    const answer = ask(topicQuestion);
    if (answer === null) return finish({ ...base(), status: 'ASKING', question: topicQuestion });
    if (answer === 'CANCEL') return finish({ ...base(), status: 'DECLINED' });
    if (!(answer in topicRequests)) invalid();
    text = topicRequests[answer as Topic];
    scopeDecision = classify(text);
  }
  if (scopeDecision.classification !== 'LEARNING' || scopeDecision.requiresConfirmation) invalid();
  learningRequest = text;
  const topic = topicFor(text);
  if (topic === null || topic === 'IMAGE' || topic === 'AUTOMATION' || topic === 'AGENT') {
    return finish({
      ...base(),
      status: 'LEARNING_DEFINITION_GAP',
      reason: 'UNSUPPORTED_THEME',
      requiredDefinitionRefs: Object.freeze([]),
    });
  }
  const count = topic === 'STRUCTURE' ? 1 : topic === 'CONTEXT' ? 2 : 3;
  const definitions = AI_TRAINING_LEARNING_DEFINITION_FIXTURES.slice(0, count);
  const definitionRefs = Object.freeze(definitions.map((definition) => definition.reference));
  if (definitionRefs.some((ref) => !approved.has(refKey(ref)))) {
    return finish({
      ...base(),
      status: 'LEARNING_DEFINITION_GAP',
      reason: 'UNAPPROVED_OR_MISSING_DEFINITION',
      requiredDefinitionRefs: definitionRefs,
    });
  }
  if (context.aiTraining.aiLevel === 'UNKNOWN' && experience === 'UNKNOWN') {
    const answer = ask(experienceQuestion);
    if (answer === null)
      return finish({ ...base(), status: 'ASKING', question: experienceQuestion });
    // NONE, SOME, UNKNOWN remain transient answers. No persistence or mastery inference.
  }
  const objectives = {
    STRUCTURE: '生成AIへの指示の背景・目的・依頼を整理し、自分で指示を組み立て、出力を確認できる',
    CONTEXT: '生成AIへ必要な背景情報を安全に伝え、自分で指示を組み立て、出力を確認できる',
    CONSTRAINT: '生成AIへの指示に具体的で矛盾しない条件を指定し、自分で出力を確認できる',
    PROMPT: '生成AIへの指示の構造・背景・条件を理解し、自分で指示を作成し、出力を確認できる',
  } as const;
  const candidate = Object.freeze({
    goal: defineLearningGoalCandidate({
      kind: 'CANDIDATE',
      scope,
      scopeDecision,
      semanticRef: aiTrainingGoalSemanticReference(
        'USE_AI_IN_DAILY_WORK',
        AI_TRAINING_LEARNING_CATALOG_VERSION,
      ),
    }),
    learningObjective: objectives[topic],
    targetSkillRefs: Object.freeze(definitions.flatMap((definition) => definition.targetSkillRefs)),
    definitionRefs,
  });
  const boundGoalQuestion = Object.freeze({
    ...goalQuestion,
    candidateKey: JSON.stringify({
      scope,
      ruleVersion: AI_TRAINING_CONSULTATION_RULE_VERSION,
      semanticRef: candidate.goal.semanticRef,
      objective: candidate.learningObjective,
      definitionRefs,
    }),
  });
  const confirmation = ask(boundGoalQuestion);
  if (confirmation === null)
    return finish({
      ...base(),
      status: 'GOAL_CANDIDATE',
      candidate,
      question: boundGoalQuestion,
      confirmation: 'REQUIRED',
    });
  if (confirmation === 'NO') return finish({ ...base(), status: 'DECLINED' });
  return finish({
    ...base(),
    status: 'LEARNER_SELECTED_CANDIDATE',
    candidate,
    confirmation: 'LEARNER_SELECTED',
    selectedByUserId: scope.userId,
  });
}
