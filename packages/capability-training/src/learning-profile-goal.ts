import {
  defineLearnerScope,
  defineLearnerProfileProjection,
  projectProgramMemberGoalReference,
  selectPrimaryLearningGoalReference,
  type LearnerScope,
  type ExistingProgramMemberGoalSource,
  type LearningGoalSemanticReference,
} from '@bunshin/application';
import {
  AI_TRAINING_LEARNING_CATALOG_VERSION,
  TRAINING_USE_CASE_KEYS,
  TRAINING_TOPIC_KEYS,
  TRAINING_GOAL_KEYS,
  type TrainingGoalKey,
  type TrainingTopicKey,
  type TrainingUseCaseKey,
} from './learning-catalog';

export const AI_TRAINING_PROFILE_PROJECTION_VERSION = 'AI_TRAINING_PROFILE_PROJECTION_V1';
export type AiTrainingExperience = 'UNKNOWN' | 'NONE' | 'SOME';
export interface AiTrainingProfileProjection {
  readonly contractVersion: typeof AI_TRAINING_PROFILE_PROJECTION_VERSION;
  readonly scope: LearnerScope;
  readonly sourceProfileId: string | null;
  readonly catalogVersion: string | null;
  readonly aiLevel: 'UNKNOWN' | 'BEGINNER' | 'INTERMEDIATE';
  /** Existing BEGINNER / NOT_YET are not evidence of no AI experience. */
  readonly aiExperience: AiTrainingExperience;
  readonly aiUseCases: readonly TrainingUseCaseKey[] | null;
  readonly preferredTopics: readonly TrainingTopicKey[] | null;
  /** Catalog preference, not a ProgramMemberGoal identity or confirmation. */
  readonly learningGoalKey: TrainingGoalKey | null;
}
/** Structural read adapter input; no Prisma or Runtime dependency. */
export interface ExistingTrainingParticipantProfileSource extends LearnerScope {
  readonly id: string;
  readonly assessmentVersion: string;
  readonly dailyMinutes: number;
  readonly aiLevel: string;
  readonly aiUseCases: unknown;
  readonly preferredTopics: unknown;
  readonly learningGoalKey: string | null;
}
function invalid(): never {
  throw new Error('invalid AI training profile projection');
}
export function defineAiTrainingExperience(value: AiTrainingExperience): AiTrainingExperience {
  if (!['UNKNOWN', 'NONE', 'SOME'].includes(value)) invalid();
  return value;
}
function catalogKeys<Key extends string>(value: unknown, allowed: readonly Key[]): readonly Key[] {
  if (
    !Array.isArray(value) ||
    value.length > allowed.length ||
    value.some((key) => !allowed.includes(key as Key))
  )
    invalid();
  return Object.freeze([...new Set(value as Key[])]);
}
export function aiTrainingGoalSemanticReference(
  goalKey: string,
  catalogVersion: string,
): LearningGoalSemanticReference {
  if (
    catalogVersion !== AI_TRAINING_LEARNING_CATALOG_VERSION ||
    !TRAINING_GOAL_KEYS.includes(goalKey as TrainingGoalKey)
  )
    invalid();
  return Object.freeze({ packageKey: 'AI_TRAINING', goalKey, version: catalogVersion });
}

/** Unconnected read projection. No profile/Goal writes or inference from Goal labels. */
export function projectAiTrainingLearnerProfiles(input: {
  readonly scope: LearnerScope;
  readonly profile: ExistingTrainingParticipantProfileSource | null;
  readonly goals: readonly ExistingProgramMemberGoalSource[];
}) {
  const scope = defineLearnerScope(input.scope);
  const refs = input.goals.map((goal) => projectProgramMemberGoalReference(scope, goal));
  const currentPrimaryGoalRef = selectPrimaryLearningGoalReference(scope, refs);
  const source = input.profile;
  if (source) {
    const sourceScope = defineLearnerScope(source);
    if (
      Object.keys(scope).some(
        (key) => scope[key as keyof LearnerScope] !== sourceScope[key as keyof LearnerScope],
      ) ||
      !source.id.trim() ||
      source.id.length > 200 ||
      source.assessmentVersion !== AI_TRAINING_LEARNING_CATALOG_VERSION ||
      ![5, 10, 15].includes(source.dailyMinutes) ||
      !['BEGINNER', 'INTERMEDIATE'].includes(source.aiLevel)
    )
      invalid();
    if (source.learningGoalKey !== null)
      aiTrainingGoalSemanticReference(source.learningGoalKey, source.assessmentVersion);
  }
  const learner = defineLearnerProfileProjection({
    scope,
    preferredDailyMinutes: source?.dailyMinutes ?? null,
    currentPrimaryGoalRef,
  });
  const aiTraining: AiTrainingProfileProjection = Object.freeze({
    contractVersion: AI_TRAINING_PROFILE_PROJECTION_VERSION,
    scope,
    sourceProfileId: source?.id ?? null,
    catalogVersion: source?.assessmentVersion ?? null,
    aiLevel: (source?.aiLevel ?? 'UNKNOWN') as AiTrainingProfileProjection['aiLevel'],
    aiExperience: defineAiTrainingExperience('UNKNOWN'),
    aiUseCases: source ? catalogKeys(source.aiUseCases, TRAINING_USE_CASE_KEYS) : null,
    preferredTopics: source ? catalogKeys(source.preferredTopics, TRAINING_TOPIC_KEYS) : null,
    learningGoalKey: (source?.learningGoalKey ?? null) as TrainingGoalKey | null,
  });
  return Object.freeze({ learner, aiTraining, goalHistory: Object.freeze(refs) });
}
