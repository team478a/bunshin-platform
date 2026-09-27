import type { TrainingAiLevel, TrainingRole } from './index';
import type { TrainingGoalKey } from './learning-catalog';
import type { TrainingMissionDefinition } from './runtime';

export const AI_TRAINING_PERSONALIZATION_VERSION = 'AI_TRAINING_PERSONALIZATION_V1';
export const TRAINING_DEVICE_TYPES = ['SMARTPHONE', 'PC', 'BOTH'] as const;
export type TrainingDeviceType = (typeof TRAINING_DEVICE_TYPES)[number];

export type TrainingWorkContext = {
  schemaVersion: 1;
  workDescription: string;
  timeConsumingTask: string;
  aiImprovementTarget: string;
  deviceType: TrainingDeviceType;
};

export type TrainingMissionPersonalization = {
  scenario: string;
  task: string;
  hint: string;
  reason: string;
  version: typeof AI_TRAINING_PERSONALIZATION_VERSION;
};

export interface TrainingMissionPersonalizer {
  personalize(input: {
    mission: TrainingMissionDefinition;
    role: TrainingRole;
    aiLevel: TrainingAiLevel;
    learningGoalKey: TrainingGoalKey | null;
    workContext: TrainingWorkContext;
    workUseCount: number;
  }): Promise<TrainingMissionPersonalization>;
}

const roleLabels: Record<TrainingRole, string> = {
  SALES: '営業・接客',
  OFFICE: '事務・バックオフィス',
  MANAGER: '経営・管理',
  OTHER: '現在のお仕事',
};

export function parseTrainingWorkContext(value: unknown): TrainingWorkContext | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const context = value as Record<string, unknown>;
  if (
    context['schemaVersion'] !== 1 ||
    typeof context['workDescription'] !== 'string' ||
    typeof context['timeConsumingTask'] !== 'string' ||
    typeof context['aiImprovementTarget'] !== 'string' ||
    !TRAINING_DEVICE_TYPES.includes(context['deviceType'] as TrainingDeviceType)
  ) {
    return null;
  }
  return context as TrainingWorkContext;
}

export function resolveTrainingWorkContext(
  value: unknown,
  role: TrainingRole,
): TrainingWorkContext {
  return (
    parseTrainingWorkContext(value) ?? {
      schemaVersion: 1,
      workDescription: `${roleLabels[role]}の仕事をしています`,
      timeConsumingTask: '日々の文章作成や情報整理',
      aiImprovementTarget: '日々の仕事でAIを使うこと',
      deviceType: 'BOTH',
    }
  );
}

export class RuleBasedTrainingMissionPersonalizer implements TrainingMissionPersonalizer {
  personalize(input: {
    mission: TrainingMissionDefinition;
    role: TrainingRole;
    aiLevel: TrainingAiLevel;
    learningGoalKey: TrainingGoalKey | null;
    workContext: TrainingWorkContext;
    workUseCount: number;
  }): Promise<TrainingMissionPersonalization> {
    const focus = input.workContext.aiImprovementTarget || input.workContext.timeConsumingTask;
    const scenario = `${input.workContext.workDescription}。今回は「${focus}」を題材に、${input.mission.quality.learningObjective}`;
    return Promise.resolve({
      scenario,
      task: `あなたの仕事にある「${focus}」を思い浮かべ、次の課題に取り組んでください。${input.mission.quality.task}`,
      hint: `実在する顧客名や機密情報は書かず、「${focus}」の目的、相手、必要な条件を順に整理してください。`,
      reason: `${roleLabels[input.role]}のお仕事で「${focus}」を改善したいと回答しているためです。`,
      version: AI_TRAINING_PERSONALIZATION_VERSION,
    });
  }
}
