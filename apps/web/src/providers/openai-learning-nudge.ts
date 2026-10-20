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
}) {
  const body = serializeOpenAiTaskRequest('LEARNING_NUDGE', {
    model: input.model,
    store: false,
    max_output_tokens: input.permit.maxOutputTokens,
    input: [
      {
        role: 'system',
        content:
          'あなたはAI研修の短い声かけ文を整える補助です。与えられた固定文面の意図を保ち、自然で短い日本語に言い換えてください。記載された状況以外の事実を推測せず、名前・個人情報・URL・成果の断定・急かす表現・追加の質問を入れないでください。利用者の自由記述、プロフィール、相談、学習履歴は入力されていません。出力はmessageだけのJSONにしてください。',
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
