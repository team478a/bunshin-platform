import type {
  TrainingChallengeKey,
  TrainingGoalKey,
  TrainingTopicKey,
  TrainingUseCaseKey,
} from '@bunshin/capability-training';
import type { TrainingAiLevel, TrainingDeviceType, TrainingRole } from './ai-training-types';

/** Empty is a UI-only unanswered state, never a persisted learner classification. */
export interface TrainingSetupAnswers {
  role: TrainingRole | '';
  aiLevel: TrainingAiLevel | '';
  aiUseCases: TrainingUseCaseKey[];
  workChallenges: TrainingChallengeKey[];
  preferredTopics: TrainingTopicKey[];
  dailyMinutes: 5 | 10 | 15 | '';
  learningGoalKey: TrainingGoalKey | '';
  workDescription: string;
  timeConsumingTask: string;
  aiImprovementTarget: string;
  deviceType: TrainingDeviceType | '';
}

export function trainingSetupStepError(step: number, answers: TrainingSetupAnswers): string | null {
  switch (step) {
    case 1:
      return answers.role && answers.aiLevel ? null : '仕事の種類とAIの経験を選んでください。';
    case 2:
      return answers.workDescription.trim().length >= 5 &&
        answers.timeConsumingTask.trim().length >= 2 &&
        answers.aiImprovementTarget.trim().length >= 2 &&
        answers.deviceType
        ? null
        : '普段の仕事、改善したい仕事と、使う端末を回答してください。';
    case 3:
      return answers.aiUseCases.length && answers.workChallenges.length
        ? null
        : '今のAIの使い方と、困っていることを1つ以上選んでください。';
    case 4:
      return answers.preferredTopics.length ? null : '学びたいテーマを1つ以上選んでください。';
    case 5:
      return answers.learningGoalKey && answers.dailyMinutes
        ? null
        : '学習目標と使える時間を選んでください。';
    default:
      return '最初の設定から確認してください。';
  }
}

export function trainingSetupError(answers: TrainingSetupAnswers): string | null {
  for (let step = 1; step <= 5; step++) {
    const error = trainingSetupStepError(step, answers);
    if (error) return error;
  }
  return null;
}
