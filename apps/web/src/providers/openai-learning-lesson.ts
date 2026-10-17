import 'server-only';
import {
  validateLearningLessonProposal,
  type SavedPersonalLearningRequest,
  type AiCallMeasurement,
  type PersonalLearningTextPermit,
} from '@bunshin/application';
import {
  OPENAI_TASK_RESPONSES_ENDPOINT,
  serializeOpenAiTaskRequest,
} from '../ai/openai-task-compatibility';
import { learningProposalPolicy } from './learning-proposal-policy';

export const LEARNING_LESSON_PROMPT_VERSION = 'learning-lesson-tool-independent-v2';
export function learningLessonBody(
  request: SavedPersonalLearningRequest,
  model: string,
  permit: Pick<PersonalLearningTextPermit, 'maxRequestBytes' | 'maxOutputTokens'>,
  extendedScope = false,
  persona: readonly {
    attributeKey: string;
    value: string;
    epistemicStatus: 'UNCONFIRMED_GUESS' | 'LEARNER_CONFIRMED';
  }[] = [],
) {
  const proposalPolicy = learningProposalPolicy(extendedScope);
  const strings = ['reason', 'outcome', 'explanation', 'example'];
  const lists = ['questions', 'practice', 'evidence', 'criteria'];
  const body = serializeOpenAiTaskRequest('LEARNING_LESSON', {
    model,
    store: false,
    max_output_tokens: permit.maxOutputTokens,
    input: [
      {
        role: 'system',
        content: proposalPolicy.instructions,
      },
      {
        role: 'user',
        content: JSON.stringify({
          originalText: request.originalText,
          deviceType: request.deviceType,
          toolDescription: request.toolDescription,
          experienceDescription: request.experienceDescription,
          currentPosition: request.currentPosition,
          persona: persona.map(({ attributeKey, value, epistemicStatus }) => ({
            attributeKey,
            value,
            epistemicStatus,
          })),
        }),
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'learning_lesson',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['READY', 'NEEDS_CONTEXT', 'OUT_OF_SCOPE'] },
            ...Object.fromEntries(strings.map((k) => [k, { type: 'string' }])),
            ...Object.fromEntries(
              lists.map((k) => [k, { type: 'array', items: { type: 'string' } }]),
            ),
          },
          required: ['status', ...strings, ...lists],
        },
      },
    },
  });
  if (Buffer.byteLength(body, 'utf8') > permit.maxRequestBytes)
    throw new Error('learning request limit exceeded');
  return body;
}
/** One bounded request. Raw errors/responses never become logs or learner permissions. */
export async function generateLearningStructured<T>(options: {
  apiKey: string;
  model: string;
  body: string;
  fetch?: typeof fetch;
  validate: (value: unknown) => T;
}) {
  const start = Date.now();
  const response = await (options.fetch ?? fetch)(OPENAI_TASK_RESPONSES_ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
    body: options.body,
    signal: AbortSignal.timeout(45000),
  });
  // Bound the entire response stream, not just response headers or fetch() latency.
  const reader = response.body?.getReader();
  if (!reader) throw new Error('learning response unavailable');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 128000) {
        await reader.cancel();
        throw new Error('learning response limit exceeded');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as {
    model?: string;
    status?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
    output?: { content?: { type?: string; text?: string }[] }[];
  };
  const token = (n: unknown) =>
    typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 2147483647 ? n : null;
  let proposal: T | null = null;
  try {
    if (response.ok && raw.status === 'completed')
      proposal = options.validate(
        JSON.parse(
          raw.output?.flatMap((x) => x.content ?? []).find((x) => x.type === 'output_text')?.text ??
            '',
        ),
      );
  } catch {
    /* Invalid output is a failed measured attempt, not a blank lesson. */
  }
  const measurement: AiCallMeasurement = {
    provider: 'openai',
    model: raw.model ?? 'unknown',
    inputTokens: token(raw.usage?.input_tokens),
    outputTokens: token(raw.usage?.output_tokens),
    cachedInputTokens: token(raw.usage?.input_tokens_details?.cached_tokens),
    latencyMs: Math.min(2147483647, Date.now() - start),
    success: proposal !== null,
    errorCategory: proposal ? null : response.status === 429 ? 'RATE_LIMIT' : 'INVALID_RESPONSE',
    validationResult: proposal ? 'PASSED' : 'FAILED',
    fallbackUsed: false,
    occurredAt: new Date(start).toISOString(),
  };
  return {
    value: proposal,
    measurement,
    requestFinished: ['completed', 'failed', 'incomplete', 'cancelled'].includes(raw.status ?? ''),
  };
}

export function generateLearningLesson(options: {
  apiKey: string;
  model: string;
  body: string;
  fetch?: typeof fetch;
}) {
  return generateLearningStructured({ ...options, validate: validateLearningLessonProposal });
}
