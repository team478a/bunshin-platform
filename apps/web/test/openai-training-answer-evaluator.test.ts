import { describe, expect, it, vi } from 'vitest';
import { OpenAiTrainingAnswerEvaluator } from '../src/providers/openai-training-answer-evaluator';

describe('OpenAiTrainingAnswerEvaluator', () => {
  it('returns a validated structured evaluation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'test-model',
          usage: { input_tokens: 120, output_tokens: 45 },
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    result: 'PASS',
                    understanding: 82,
                    strengths: ['目的を明確に書けています'],
                    weaknesses: ['出力形式を追加するとさらに良くなります'],
                    nextRecommendation: '次の実務課題へ進む',
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await new OpenAiTrainingAnswerEvaluator({
      apiKey: 'test-key',
      model: 'test-model',
      requestCostUsdMicros: 25,
      fetch: fetcher,
    }).evaluate({ missionDefinitionKey: 'PROMPT_BASIC', answer: '目的と条件を書きます。' });

    expect(result.evaluation).toMatchObject({ result: 'PASS', understanding: 82 });
    expect(result.inputTokens).toBe(120);
    expect(result.estimatedCostUsdMicros).toBe(25);
  });

  it('rejects an evaluation outside the allowed schema', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    result: 'PASS',
                    understanding: 120,
                    strengths: [],
                    weaknesses: [],
                    nextRecommendation: '次へ',
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(
      new OpenAiTrainingAnswerEvaluator({
        apiKey: 'test-key',
        model: 'test-model',
        requestCostUsdMicros: 0,
        fetch: fetcher,
      }).evaluate({ missionDefinitionKey: 'PROMPT_BASIC', answer: '回答' }),
    ).rejects.toThrow();
  });
});
