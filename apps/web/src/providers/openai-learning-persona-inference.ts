import 'server-only';
import {
  isPersonalLearningPersonaInferredKey,
  isPersonalLearningPersonaValueDisallowed,
} from '@bunshin/capability-training';
import type { AiCallMeasurement, AiModelCapability } from '@bunshin/application';
import { serializeOpenAiTaskRequest } from '../ai/openai-task-compatibility';
import { generateLearningStructured } from './openai-learning-lesson';
import type { PersonalLearningOfferPolicy } from '@bunshin/capability-training';
import { personalLearningOfferPromptPolicy } from './personal-learning-offer-policy';

export const PERSONAL_LEARNING_PERSONA_INFERENCE_PROMPT_VERSION = 'manaberu-persona-inference-v1';
export type PersonaInferenceSource = {
  evidenceType: 'CONVERSATION_EVENT' | 'PRACTICE_ANSWER' | 'LEARNING_REQUEST';
  evidenceId: string;
  occurredAt: Date;
  text: string;
};
export type PersonaInferenceResult = { attributeKey: string; value: string; sourceIndex: number }[];

/** Screen source records while avoiding substring-only matches on ordinary Japanese wording. */
export function screenPersonaInferenceSources(
  sources: readonly PersonaInferenceSource[],
): PersonaInferenceSource[] {
  return sources.filter(
    ({ text }) => !!text.trim() && !isPersonalLearningPersonaValueDisallowed(text),
  );
}

export function validatePersonaInferenceOutput(value: unknown): PersonaInferenceResult {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid persona inference');
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== 1 || !Array.isArray(object.items) || object.items.length > 5)
    throw new Error('invalid persona inference');
  const result = object.items.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error('invalid item');
    const row = entry as Record<string, unknown>;
    if (
      Object.keys(row).length !== 3 ||
      typeof row.attributeKey !== 'string' ||
      !isPersonalLearningPersonaInferredKey(row.attributeKey) ||
      typeof row.value !== 'string' ||
      !row.value.trim() ||
      row.value.trim().length > 1000 ||
      isPersonalLearningPersonaValueDisallowed(row.value) ||
      !Number.isInteger(row.sourceIndex) ||
      Number(row.sourceIndex) < 0
    )
      throw new Error('invalid persona inference item');
    return {
      attributeKey: row.attributeKey,
      value: row.value.trim(),
      sourceIndex: Number(row.sourceIndex),
    };
  });
  if (new Set(result.map(({ attributeKey }) => attributeKey)).size !== result.length)
    throw new Error('duplicate persona attribute');
  return result;
}

export function personaInferenceBody(input: {
  model: string;
  maxOutputTokens: number;
  maxRequestBytes: number;
  maxSourceBytes: number;
  sources: readonly PersonaInferenceSource[];
  offerPolicy?: PersonalLearningOfferPolicy;
}) {
  const build = (
    sources: readonly {
      sourceIndex: number;
      evidenceType: PersonaInferenceSource['evidenceType'];
      text: string;
    }[],
  ) =>
    serializeOpenAiTaskRequest('PERSONAL_LEARNING_PERSONA_INFERENCE', {
      model: input.model,
      store: false,
      max_output_tokens: Math.min(300, input.maxOutputTokens),
      input: [
        {
          role: 'system',
          content: personalLearningOfferPromptPolicy(input.offerPolicy)
            .personaInferenceInstructions,
        },
        { role: 'user', content: JSON.stringify({ sources }) },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'personal_learning_persona_inference',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              items: {
                type: 'array',
                maxItems: 5,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    attributeKey: {
                      type: 'string',
                      enum: [
                        'learning_purpose',
                        'explanation_style',
                        'learning_pace',
                        'stated_goal',
                        'ai_tool_familiarity',
                      ],
                    },
                    value: { type: 'string' },
                    sourceIndex: { type: 'integer', minimum: 0 },
                  },
                  required: ['attributeKey', 'value', 'sourceIndex'],
                },
              },
            },
            required: ['items'],
          },
        },
      },
    });
  let sources = input.sources.map((source, sourceIndex) => ({
    sourceIndex,
    evidenceType: source.evidenceType,
    text: source.text.slice(0, 120),
  }));
  let body = build(sources);
  const sourceBytes = () =>
    sources.reduce((total, source) => total + Buffer.byteLength(source.text, 'utf8'), 0);
  while (
    (Buffer.byteLength(body, 'utf8') > input.maxRequestBytes ||
      sourceBytes() > input.maxSourceBytes) &&
    sources.some(({ text }) => text.length > 0)
  ) {
    sources = sources.map((source) => ({
      ...source,
      text: source.text.slice(0, Math.max(0, source.text.length - 20)),
    }));
    body = build(sources);
  }
  if (
    !sources.length ||
    Buffer.byteLength(body, 'utf8') > input.maxRequestBytes ||
    sourceBytes() > input.maxSourceBytes
  )
    throw new Error('persona inference request limit exceeded');
  return body;
}

export async function generatePersonaInference(options: {
  apiKey: string;
  model: string;
  body: string;
  provider?: 'openai' | 'google';
  modelCapabilities: readonly AiModelCapability[];
  fetch?: typeof fetch;
}): Promise<{
  value: PersonaInferenceResult;
  measurement: AiCallMeasurement;
  requestFinished: boolean;
}> {
  const result = await generateLearningStructured({
    ...options,
    validate: validatePersonaInferenceOutput,
  });
  if (!result.value)
    return { value: [], measurement: result.measurement, requestFinished: result.requestFinished };
  return {
    value: result.value,
    measurement: result.measurement,
    requestFinished: result.requestFinished,
  };
}
