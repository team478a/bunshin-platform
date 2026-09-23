import type {
  TrainingChallengeKey,
  TrainingGoalKey,
  TrainingSkillKey,
  TrainingTopicKey,
  TrainingUseCaseKey,
} from '@bunshin/capability-training';

export type TrainingRole = 'SALES' | 'OFFICE' | 'MANAGER' | 'OTHER';
export type TrainingAiLevel = 'BEGINNER' | 'INTERMEDIATE';
export type TrainingInteractionType = 'HINT_VIEWED' | 'HELP_REQUESTED' | 'TRAINING_POSTPONED';

export type TrainingParticipantState = {
  enrollmentId: string;
  programName: string;
  enrollmentStatus: 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
  startsAt: string;
  endsAt: string | null;
  profile: {
    role: TrainingRole;
    aiLevel: TrainingAiLevel;
    aiUseCases: TrainingUseCaseKey[];
    workChallenges: TrainingChallengeKey[];
    preferredTopics: TrainingTopicKey[];
    dailyMinutes: 5 | 10 | 15;
    learningGoalKey: TrainingGoalKey;
  } | null;
  goal: { title: string } | null;
  action: {
    id: string;
    sequence: number;
    actionKey: string;
    mode: 'WORK' | 'WAIT';
    status: 'PRESENTED' | 'STARTED';
    display: {
      title: string;
      reason: string;
      task: string;
      instructions: string[];
      estimatedMinutes: number | null;
      learningObjective?: string | undefined;
      businessScenario?: string | undefined;
      constraints?: readonly string[] | undefined;
      successCriteria?: readonly string[] | undefined;
      commonMistakes?: readonly string[] | undefined;
      evaluationCriteria?: readonly string[] | undefined;
      difficulty?: 'EASY' | 'STANDARD' | 'CHALLENGE' | undefined;
      difficultyGuidance?: string | undefined;
    };
    reevaluateAt: string | null;
    submission: {
      answerId: string;
      evaluationStatus: 'PENDING' | 'READY' | 'FAILED';
    } | null;
  } | null;
};

export type TrainingAction = NonNullable<TrainingParticipantState['action']>;

export type TrainingEvaluation = {
  result: 'PASS' | 'REVIEW';
  understanding: number;
  skills: Record<TrainingSkillKey, number>;
  evaluatedSkillKeys: readonly TrainingSkillKey[];
  strengths: string[];
  weaknesses: string[];
  recommendedNextSkill: TrainingSkillKey;
  nextRecommendation: string;
  evaluationRuleVersion: string;
};
