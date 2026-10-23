import 'server-only';
import { z } from 'zod';
import {
  personalLearningNudgeCopy,
  PERSONAL_LEARNING_NUDGE_PROMPT_VERSION,
  type PersonalLearningNudgeSituation,
} from '@bunshin/capability-training';
import type { AiModelCapability, PersonalLearningTextPermit } from '@bunshin/application';
import { serializeOpenAiTaskRequest } from '../ai/openai-task-compatibility';
import { generateLearningStructured } from './openai-learning-lesson';
import type { PersonalLearningOfferPolicy } from '@bunshin/capability-training';
import { personalLearningOfferPromptPolicy } from './personal-learning-offer-policy';

export const LEARNING_NUDGE_PROMPT_VERSION = PERSONAL_LEARNING_NUDGE_PROMPT_VERSION;

const nudgeMessageSchema = z
  .object({ message: z.string().trim().min(1).max(150) })
  .strict()
  .transform(({ message }) => {
    if (/https?:\/\/|www\.|@[\p{L}\p{N}._-]+/iu.test(message))
      throw new Error('unsupported nudge output');
    return message;
  });

export function learningNudgeBody(input: {
  situation: PersonalLearningNudgeSituation;
  ordinal: 1 | 2;
  model: string;
  permit: Pick<PersonalLearningTextPermit, 'maxRequestBytes' | 'maxOutputTokens'>;
  offerPolicy?: PersonalLearningOfferPolicy;
}) {
  const body = serializeOpenAiTaskRequest('LEARNING_NUDGE', {
    model: input.model,
    store: false,
    max_output_tokens: input.permit.maxOutputTokens,
    input: [
      {
        role: 'system',
        content: personalLearningOfferPromptPolicy(input.offerPolicy).nudgeInstructions,
      },
      {
        role: 'user',
        content: JSON.stringify({
          situation: input.situation,
          ordinal: input.ordinal,
          fixedIntent: personalLearningNudgeCopy(input.situation, input.ordinal),
        }),
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'learning_nudge',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { message: { type: 'string', minLength: 1, maxLength: 150 } },
          required: ['message'],
        },
      },
    },
  });
  if (Buffer.byteLength(body, 'utf8') > input.permit.maxRequestBytes)
    throw new Error('learning nudge request limit exceeded');
  return body;
}

export function generateLearningNudge(options: {
  apiKey: string;
  model: string;
  body: string;
  provider?: 'openai' | 'google';
  modelCapabilities: readonly AiModelCapability[];
  fetch?: typeof fetch;
}) {
  return generateLearningStructured({
    ...options,
    validate: (value) => nudgeMessageSchema.parse(value),
  });
}
