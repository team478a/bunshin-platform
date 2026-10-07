import type { LearnerScope, LearningGoalCandidate } from './learning-profile-goal';
import type { LearningScopeResult } from './learning-scope';
import type { LearningDefinitionReference } from './personal-learning-plan';

export const LEARNING_CONSULTATION_CONTRACT_VERSION = 'LEARNING_CONSULTATION_V1';
export const LEARNING_CONSULTATION_MAX_QUESTIONS = 3;

/** Ephemeral input, not a chat history or a durable confirmation receipt. */
export interface LearningConsultationAnswer {
  readonly questionKey: string;
  readonly answerKey: string;
  /** Exact displayed candidate binding, not an authentication token. */
  readonly candidateKey?: string;
}
export interface LearningConsultationRequest {
  readonly scope: LearnerScope;
  readonly text: string;
  readonly answers: readonly LearningConsultationAnswer[];
}
export interface LearningConsultationQuestion {
  readonly key: string;
  readonly text: string;
  readonly options: readonly { readonly key: string; readonly label: string }[];
  readonly candidateKey?: string;
}
export interface LearningConsultationGoalSuggestion {
  readonly goal: LearningGoalCandidate;
  readonly learningObjective: string;
  readonly targetSkillRefs: readonly {
    readonly packageKey: string;
    readonly skillKey: string;
    readonly version: string;
  }[];
  /** Required path candidates only, never a Plan or an Assignment. */
  readonly definitionRefs: readonly LearningDefinitionReference[];
}
interface ConsultationBase {
  readonly contractVersion: typeof LEARNING_CONSULTATION_CONTRACT_VERSION;
  readonly ruleVersion: string;
  readonly scope: LearnerScope;
  readonly scopeDecision: LearningScopeResult;
  readonly learningRequest: string | null;
  readonly questionCount: number;
}
export type LearningConsultationResult = ConsultationBase &
  (
    | { readonly status: 'ASKING'; readonly question: LearningConsultationQuestion }
    | {
        readonly status: 'GOAL_CANDIDATE';
        readonly candidate: LearningConsultationGoalSuggestion;
        readonly question: LearningConsultationQuestion;
        readonly confirmation: 'REQUIRED';
      }
    | {
        readonly status: 'LEARNER_SELECTED_CANDIDATE';
        readonly candidate: LearningConsultationGoalSuggestion;
        readonly confirmation: 'LEARNER_SELECTED';
        readonly selectedByUserId: string;
      }
    | {
        readonly status: 'LEARNING_DEFINITION_GAP';
        readonly reason: 'UNSUPPORTED_THEME' | 'UNAPPROVED_OR_MISSING_DEFINITION';
        readonly requiredDefinitionRefs: readonly LearningDefinitionReference[];
      }
    | {
        readonly status:
          'SCOPE_REVIEW_REQUIRED' | 'OUTSIDE_SCOPE' | 'LEARNING_SUPPORT' | 'DECLINED';
      }
  );
