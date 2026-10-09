import { describe, expect, it, vi } from 'vitest';
import {
  OPENAI_TASK_COMPATIBILITY_VERSION,
  OPENAI_TASK_RESPONSES_ENDPOINT,
  assertOpenAiTaskModel,
  assertOpenAiTaskRequest,
  serializeOpenAiTaskRequest,
  type OpenAiCompatibilityTask,
} from '../src/ai/openai-task-compatibility';
import { OpenAiTrainingAnswerEvaluator } from '../src/providers/openai-training-answer-evaluator';

const tasks: OpenAiCompatibilityTask[] = ['SOCIAL_PLANNER', 'TRAINING_ASSESSMENT'];
const models = ['gpt-5.2', 'gpt-5.2-2025-12-11', 'gpt-5-mini', 'gpt-5-mini-2025-08-07'];
function request(task: OpenAiCompatibilityTask) {
  return {
    model: 'gpt-5.2',
    store: false,
    input: [{ role: 'user', content: 'synthetic' }],
    text: {
      format: {
        type: 'json_schema',
        name: task === 'SOCIAL_PLANNER' ? 'daily_mission_brief' : 'training_evaluation',
        strict: true,
        schema: { type: 'object', additionalProperties: false },
      },
    },
  };
}

describe('versioned local OpenAI task compatibility', () => {
  it('fixes the policy version without claiming live quality', () => {
    expect(OPENAI_TASK_COMPATIBILITY_VERSION).toBe('OPENAI_TASK_COMPATIBILITY_V1');
  });
  it.each(tasks)('preserves the exact request for %s', (task) => {
    const value = request(task);
    const before = structuredClone(value);
    expect(serializeOpenAiTaskRequest(task, value)).toBe(JSON.stringify(before));
    expect(value).toEqual(before);
    for (const model of models) {
      expect(() => assertOpenAiTaskModel(task, model)).not.toThrow();
      expect(() => serializeOpenAiTaskRequest(task, { ...value, model })).not.toThrow();
    }
  });
  it.each(['', ' gpt-5.2', 'GPT-5.2', 'gpt-5-mini-2099-01-01', 'gpt-5.2-chat-latest', 'new-model'])(
    'does not infer compatibility for %s',
    (model) => {
      for (const task of tasks) {
        expect(() => assertOpenAiTaskModel(task, model)).toThrow(
          'OpenAI task configuration incompatible',
        );
      }
    },
  );
  it('rejects an unsupported task even with a known model', () => {
    expect(() => assertOpenAiTaskModel('OTHER' as OpenAiCompatibilityTask, 'gpt-5.2')).toThrow();
  });
  it.each([
    { temperature: 0.2 },
    { reasoning: { effort: 'low' } },
    { tools: [] },
    { stream: true },
    { previous_response_id: 'private' },
    { store: true },
    { input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'private' }] }] },
    { input: [] },
    { input: [{ role: 'assistant', content: 'private' }] },
    { text: { format: { type: 'json_object' } } },
  ])('rejects unreviewed modality/options %j', (override) => {
    for (const task of tasks) {
      expect(() => serializeOpenAiTaskRequest(task, { ...request(task), ...override })).toThrow();
    }
  });
  it('keeps schema names task-specific and requires strict object output', () => {
    for (const task of tasks) {
      const value = request(task);
      for (const format of [
        { ...value.text.format, strict: false },
        { ...value.text.format, name: 'other_schema' },
        { ...value.text.format, schema: { type: 'array' } },
        { ...value.text.format, schema: { type: 'object', additionalProperties: true } },
      ])
        expect(() => serializeOpenAiTaskRequest(task, { ...value, text: { format } })).toThrow();
    }
    const value = request('SOCIAL_PLANNER');
    expect(() =>
      serializeOpenAiTaskRequest('SOCIAL_PLANNER', {
        ...value,
        text: { format: { ...value.text.format, name: 'weekly_plan' } },
      }),
    ).not.toThrow();
  });
  it('supports only the existing Assessment output limit option', () => {
    expect(() =>
      serializeOpenAiTaskRequest('TRAINING_ASSESSMENT', {
        ...request('TRAINING_ASSESSMENT'),
        max_output_tokens: 100,
      }),
    ).not.toThrow();
    for (const limit of [null, 0, 15, 16.5, Infinity, '100'])
      expect(() =>
        serializeOpenAiTaskRequest('TRAINING_ASSESSMENT', {
          ...request('TRAINING_ASSESSMENT'),
          max_output_tokens: limit,
        }),
      ).toThrow();
    expect(() =>
      serializeOpenAiTaskRequest('SOCIAL_PLANNER', {
        ...request('SOCIAL_PLANNER'),
        max_output_tokens: 100,
      }),
    ).toThrow();
  });
  it('does not permit a different endpoint', () => {
    expect(() =>
      assertOpenAiTaskRequest(
        'SOCIAL_PLANNER',
        OPENAI_TASK_RESPONSES_ENDPOINT,
        request('SOCIAL_PLANNER'),
      ),
    ).not.toThrow();
    expect(() =>
      assertOpenAiTaskRequest(
        'SOCIAL_PLANNER',
        'https://api.openai.com/v1/chat/completions',
        request('SOCIAL_PLANNER'),
      ),
    ).toThrow();
  });
  it('rejects an unknown Assessment model before fetch, observer or admission callbacks', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const observe = vi.fn();
    const onRequestStarted = vi.fn();
    const onResponseSettled = vi.fn();
    await expect(
      new OpenAiTrainingAnswerEvaluator({
        apiKey: 'synthetic-secret',
        model: 'private-unregistered-model',
        requestCostUsdMicros: 0,
        fetch: fetcher,
        observe,
        onRequestStarted,
        onResponseSettled,
      }).evaluate({ missionDefinitionKey: 'PROMPT_BASIC', answer: 'private-answer' }),
    ).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
      cause: {
        task: 'TRAINING_ASSESSMENT',
        policyVersion: OPENAI_TASK_COMPATIBILITY_VERSION,
        reason: 'MODEL_NOT_REGISTERED',
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    expect(onRequestStarted).not.toHaveBeenCalled();
    expect(onResponseSettled).not.toHaveBeenCalled();
  });
  it('keeps private request/model data out of errors', () => {
    try {
      serializeOpenAiTaskRequest('TRAINING_ASSESSMENT', {
        ...request('TRAINING_ASSESSMENT'),
        model: 'private-model',
        answer: 'private-answer',
        apiKey: 'private-key',
      });
      throw new Error('expected incompatibility');
    } catch (error) {
      expect(error).toMatchObject({ code: 'CONFIGURATION_ERROR' });
      expect(JSON.stringify(error)).not.toMatch(
        /private-model|private-answer|private-key|synthetic/,
      );
    }
  });
});
