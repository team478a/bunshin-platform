import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiTrainingAnswerEvaluator } from '../src/providers/openai-training-answer-evaluator';
const valid = {
  understanding: 80,
  skills: {
    promptStructure: 80,
    contextSetting: 80,
    constraintSetting: 80,
    outputControl: 80,
    businessApplication: 80,
    revisionSkill: 80,
  },
  strengths: ['synthetic'],
  weaknesses: ['synthetic'],
  recommendedNextSkill: 'contextSetting',
};
function evaluator(body: unknown, status = 200) {
  const observe = vi.fn();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  return {
    observe,
    fetcher,
    provider: new OpenAiTrainingAnswerEvaluator({
      apiKey: 'synthetic-key',
      model: 'synthetic',
      requestCostUsdMicros: 9,
      fetch: fetcher,
      observe,
    }),
  };
}
const response = (text: string) => ({
  model: 'synthetic-response-model',
  usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 50 } },
  output: [{ content: [{ type: 'output_text', text }] }],
});
describe('Pilot structured Provider measurements', () => {
  afterEach(() => vi.useRealTimers());
  it('observes successful validation, actual model, cached usage and latency without bodies', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
    const f = evaluator(response(JSON.stringify(valid)));
    f.fetcher.mockImplementation(async () => {
      vi.advanceTimersByTime(123);
      return new Response(JSON.stringify(response(JSON.stringify(valid))));
    });
    const result = await f.provider.evaluate({
      missionDefinitionKey: 'PROMPT_BASIC',
      answer: 'private answer',
    });
    expect(result.estimatedCostUsdMicros).toBe(9); // unchanged V1 result contract
    expect(f.observe).toHaveBeenCalledOnce();
    expect(f.observe).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        validationResult: 'PASSED',
        cachedInputTokens: 50,
        model: 'synthetic-response-model',
        latencyMs: 123,
        fallbackUsed: false,
      }),
    );
    const serialized = JSON.stringify(f.observe.mock.calls);
    for (const text of ['private answer', 'synthetic-key', 'strengths', 'system'])
      expect(serialized).not.toContain(text);
  });
  it.each([
    ['not JSON', 'INVALID_RESPONSE'],
    [JSON.stringify({ invalid: 'private response' }), 'VALIDATION_FAILURE'],
  ])('retains consumed tokens on invalid structured output: %s', async (text, category) => {
    const f = evaluator(response(text));
    await expect(
      f.provider.evaluate({ missionDefinitionKey: 'PROMPT_BASIC', answer: 'private answer' }),
    ).rejects.toThrow();
    expect(f.observe).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 100,
        outputTokens: 20,
        errorCategory: category,
        success: false,
        validationResult: 'FAILED',
      }),
    );
  });
  it.each([
    [429, 'RATE_LIMIT'],
    [500, 'PROVIDER_ERROR'],
  ])('maps HTTP %s to safe category', async (status, category) => {
    const f = evaluator({ error: 'raw secret response' }, status);
    await expect(
      f.provider.evaluate({ missionDefinitionKey: 'PROMPT_BASIC', answer: 'private' }),
    ).rejects.toThrow();
    expect(f.observe).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCategory: category,
        inputTokens: null,
        validationResult: 'NOT_RUN',
      }),
    );
    expect(JSON.stringify(f.observe.mock.calls)).not.toContain('raw secret');
  });
  it('records timeout without a raw error or invented usage', async () => {
    const f = evaluator({});
    f.fetcher.mockRejectedValue(new DOMException('private failure', 'TimeoutError'));
    await expect(
      f.provider.evaluate({ missionDefinitionKey: 'PROMPT_BASIC', answer: 'private' }),
    ).rejects.toThrow();
    expect(f.observe).toHaveBeenCalledWith(
      expect.objectContaining({ errorCategory: 'TIMEOUT', inputTokens: null }),
    );
  });
  it('usage absent/invalid remains unknown while validation can still pass', async () => {
    const f = evaluator({
      ...response(JSON.stringify(valid)),
      usage: {
        input_tokens: -1,
        output_tokens: 'private',
        input_tokens_details: { cached_tokens: 400 },
      },
    });
    await f.provider.evaluate({ missionDefinitionKey: 'PROMPT_BASIC', answer: 'private' });
    expect(f.observe).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        inputTokens: null,
        outputTokens: null,
        cachedInputTokens: null,
      }),
    );
  });
});
