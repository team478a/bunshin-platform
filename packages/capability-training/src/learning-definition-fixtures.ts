import {
  defineLearningDefinitionReference,
  type LearningDefinitionReference,
} from '@bunshin/application';
import {
  getAiTrainingMissionQuality,
  AI_TRAINING_MISSION_QUALITY_VERSION,
} from './mission-quality';
import { AI_TRAINING_SKILL_RULE_VERSION, type TrainingSkillKey } from './skill-evaluation';
import type { TrainingActionKey } from './index';

export const AI_TRAINING_DEFINITION_FIXTURE_VERSION = 'AI_TRAINING_DEFINITION_FIXTURE_V1';
export interface AiTrainingLearningDefinitionFixture {
  readonly reference: LearningDefinitionReference;
  readonly targetSkillRefs: readonly {
    readonly packageKey: 'AI_TRAINING';
    readonly skillKey: TrainingSkillKey;
    readonly version: string;
  }[];
  readonly learningObjective: string;
  readonly prerequisites: readonly LearningDefinitionReference[];
  readonly coreConcepts: readonly string[];
  readonly safetyBoundary: readonly string[];
  readonly commonMistakes: readonly string[];
  readonly practicePattern: string;
  readonly evaluationRubricRef: {
    readonly packageKey: 'AI_TRAINING';
    readonly rubricKey: TrainingActionKey;
    readonly version: typeof AI_TRAINING_MISSION_QUALITY_VERSION;
  };
  readonly legacyMissionRef: {
    readonly actionKey: TrainingActionKey;
    readonly qualityVersion: typeof AI_TRAINING_MISSION_QUALITY_VERSION;
  };
}
const ref = (definitionKey: string) =>
  defineLearningDefinitionReference({
    packageKey: 'AI_TRAINING',
    definitionKey,
    version: AI_TRAINING_DEFINITION_FIXTURE_VERSION,
  });
function fixture(input: {
  definitionKey: string;
  missionKey: 'PROMPT_BASIC' | 'PROMPT_CONDITION';
  skillKeys: readonly TrainingSkillKey[];
  prerequisiteKeys: readonly string[];
  concepts: readonly string[];
  practicePattern: string;
}): AiTrainingLearningDefinitionFixture {
  const quality = getAiTrainingMissionQuality(input.missionKey);
  if (!quality) throw new Error('missing legacy mission quality for Definition fixture');
  return Object.freeze({
    reference: ref(input.definitionKey),
    targetSkillRefs: Object.freeze(
      input.skillKeys.map((skillKey) =>
        Object.freeze({
          packageKey: 'AI_TRAINING' as const,
          skillKey,
          version: AI_TRAINING_SKILL_RULE_VERSION,
        }),
      ),
    ),
    learningObjective: quality.learningObjective,
    prerequisites: Object.freeze(input.prerequisiteKeys.map(ref)),
    coreConcepts: Object.freeze([...input.concepts]),
    safetyBoundary: Object.freeze([
      '本人が学ぶ。実務代行や完成成果物の制作を行わない',
      '個人情報・社外秘を練習へ入れない',
      'AI出力の内容を本人が確認する',
    ]),
    commonMistakes: Object.freeze([...quality.commonMistakes]),
    practicePattern: input.practicePattern,
    evaluationRubricRef: Object.freeze({
      packageKey: 'AI_TRAINING',
      rubricKey: input.missionKey,
      version: AI_TRAINING_MISSION_QUALITY_VERSION,
    }),
    legacyMissionRef: Object.freeze({
      actionKey: input.missionKey,
      qualityVersion: AI_TRAINING_MISSION_QUALITY_VERSION,
    }),
  });
}

/** Three review fixtures only: not a Registry, approved Library, or runtime teaching source. */
export const AI_TRAINING_LEARNING_DEFINITION_FIXTURES: readonly AiTrainingLearningDefinitionFixture[] =
  Object.freeze([
    fixture({
      definitionKey: 'PROMPT_STRUCTURE',
      missionKey: 'PROMPT_BASIC',
      skillKeys: ['promptStructure'],
      prerequisiteKeys: [],
      concepts: ['背景', '目的', '依頼範囲'],
      practicePattern: '用途に合わせて背景・目的・依頼を分けたPromptを本人が組み立てる',
    }),
    fixture({
      definitionKey: 'CONTEXT_SETTING',
      missionKey: 'PROMPT_BASIC',
      skillKeys: ['contextSetting'],
      prerequisiteKeys: ['PROMPT_STRUCTURE'],
      concepts: ['対象', '背景情報', '目的との関連'],
      practicePattern: '用途に必要な背景情報を選び、機密情報を除いたPromptへ追加する',
    }),
    fixture({
      definitionKey: 'CONSTRAINT_SETTING',
      missionKey: 'PROMPT_CONDITION',
      skillKeys: ['constraintSetting'],
      prerequisiteKeys: ['CONTEXT_SETTING'],
      concepts: ['条件', '測定可能性', '一貫性'],
      practicePattern: '用途に必要な条件を選び、具体的で矛盾しないPromptを本人が作る',
    }),
  ]);
