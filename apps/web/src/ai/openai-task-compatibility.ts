import 'server-only';
import { ApplicationError } from '@bunshin/shared';

export const OPENAI_TASK_COMPATIBILITY_VERSION = 'OPENAI_TASK_COMPATIBILITY_V1';
export const OPENAI_TASK_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
export type OpenAiCompatibilityTask = 'SOCIAL_PLANNER' | 'TRAINING_ASSESSMENT';

// Local request compatibility, not a live quality/access/price approval or model router.
const models = new Set(['gpt-5.2', 'gpt-5.2-2025-12-11', 'gpt-5-mini', 'gpt-5-mini-2025-08-07']);
const schemaNames: Record<OpenAiCompatibilityTask, readonly string[]> = {
  SOCIAL_PLANNER: ['daily_mission_brief', 'weekly_plan'],
  TRAINING_ASSESSMENT: ['training_evaluation'],
};

function fail(task: OpenAiCompatibilityTask, reason: string): never {
  // Never copy model values, request bodies, answers, schemas or credentials into errors.
  throw new ApplicationError('CONFIGURATION_ERROR', 'OpenAI task configuration incompatible', {
    task,
    policyVersion: OPENAI_TASK_COMPATIBILITY_VERSION,
    reason,
  });
}

export function assertOpenAiTaskModel(task: OpenAiCompatibilityTask, model: string) {
  if (!Object.hasOwn(schemaNames, task)) fail(task, 'TASK_NOT_SUPPORTED');
  if (!models.has(model)) fail(task, 'MODEL_NOT_REGISTERED');
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate the actual outgoing body, without changing it or bypassing execution gates. */
export function assertOpenAiTaskRequest(
  task: OpenAiCompatibilityTask,
  endpoint: string,
  value: unknown,
) {
  if (!object(value) || typeof value.model !== 'string') fail(task, 'INVALID_REQUEST');
  assertOpenAiTaskModel(task, value.model);
  if (endpoint !== OPENAI_TASK_RESPONSES_ENDPOINT) fail(task, 'ENDPOINT_NOT_SUPPORTED');
  if (value.store !== false) fail(task, 'STORE_NOT_DISABLED');
  const keys = ['model', 'store', 'input', 'text'];
  if (task === 'TRAINING_ASSESSMENT') keys.push('max_output_tokens');
  if (Object.keys(value).some((key) => !keys.includes(key))) fail(task, 'OPTION_NOT_SUPPORTED');
  if (
    Object.hasOwn(value, 'max_output_tokens') &&
    (!Number.isInteger(value.max_output_tokens) || Number(value.max_output_tokens) < 16)
  )
    fail(task, 'INVALID_OUTPUT_LIMIT');
  if (
    !Array.isArray(value.input) ||
    value.input.length === 0 ||
    value.input.some(
      (item: unknown) =>
        !object(item) ||
        !['system', 'user'].includes(String(item.role)) ||
        typeof item.content !== 'string' ||
        Object.keys(item).some((key) => !['role', 'content'].includes(key)),
    )
  )
    fail(task, 'INPUT_MODALITY_NOT_SUPPORTED');
  const format = object(value.text) ? value.text.format : undefined;
  if (
    !object(value.text) ||
    Object.keys(value.text).some((key) => key !== 'format') ||
    !object(format) ||
    format.type !== 'json_schema' ||
    format.strict !== true ||
    typeof format.name !== 'string' ||
    !schemaNames[task].includes(format.name) ||
    Object.keys(format).some((key) => !['type', 'name', 'strict', 'schema'].includes(key)) ||
    !object(format.schema) ||
    format.schema.type !== 'object' ||
    format.schema.additionalProperties !== false
  )
    fail(task, 'OUTPUT_SCHEMA_NOT_SUPPORTED');
}

export function serializeOpenAiTaskRequest(task: OpenAiCompatibilityTask, value: unknown) {
  assertOpenAiTaskRequest(task, OPENAI_TASK_RESPONSES_ENDPOINT, value);
  return JSON.stringify(value);
}
