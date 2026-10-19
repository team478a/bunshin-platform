import type { AiCallMeasurement } from './ai-call-observability';
import type { AiModelCapability } from './ai-provider-configuration';

export type LearningAiTask =
  | 'LESSON'
  | 'CONVERSATION'
  | 'PRACTICE_SUPPORT'
  | 'EVIDENCE_REVIEW'
  | 'PERSONA_INFERENCE'
  | 'NUDGE_COPY';

export interface LearningAiRequest {
  task: LearningAiTask;
  provider: 'openai' | 'google';
  model: string;
  modelCapabilities: readonly AiModelCapability[];
  serializedPrompt: string;
}

export interface LearningAiResult<T> {
  value: T | null;
  measurement: AiCallMeasurement;
  requestFinished: boolean;
}

/** Purpose-level boundary; provider wire formats stay in apps/web adapters. */
export interface LearningAiGenerationPort {
  generate<T>(
    input: LearningAiRequest,
    validate: (value: unknown) => T,
    credentials: { apiKey: string },
  ): Promise<LearningAiResult<T>>;
}
