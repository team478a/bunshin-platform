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
                    understanding: 82,
                    skills: {
                      promptStructure: 84,
                      contextSetting: 76,
                      constraintSetting: 65,
                      outputControl: 64,
                      businessApplication: 70,
                      revisionSkill: 62,
                    },
                    strengths: ['目的を明確に書けています'],
                    weaknesses: ['出力形式を追加するとさらに良くなります'],
                    recommendedNextSkill: 'businessApplication',
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
    expect(result.evaluation.skills.contextSetting).toBe(76);
    expect(result.evaluation.evaluatedSkillKeys).toEqual(['promptStructure', 'contextSetting']);
    expect(result.inputTokens).toBe(120);
    expect(result.estimatedCostUsdMicros).toBe(25);
    const body = fetcher.mock.calls[0]?.[1]?.body;
    expect(typeof body).toBe('string');
    if (typeof body !== 'string') throw new Error('request body was not serialized');
    const request = JSON.parse(body) as {
      input: Array<{ role: string; content: string }>;
    };
    const gradingInput = JSON.parse(request.input[1]!.content) as Record<string, unknown>;
    expect(gradingInput['learningObjective']).toBeTruthy();
    expect(gradingInput['businessScenario']).toBeTruthy();
    expect(gradingInput['successCriteria']).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(gradingInput['evaluationCriteria']).toEqual(
      expect.arrayContaining([expect.any(String)]),
    );
    expect(gradingInput['evaluatedSkillKeys']).toEqual(['promptStructure', 'contextSetting']);
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
                    understanding: 120,
                    skills: {
                      promptStructure: 80,
                      contextSetting: 70,
                      constraintSetting: 60,
                      outputControl: 60,
                      businessApplication: 60,
                      revisionSkill: 60,
                    },
                    strengths: [],
                    weaknesses: [],
                    recommendedNextSkill: 'promptStructure',
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

  it('rejects an unknown mission without calling the provider', async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      new OpenAiTrainingAnswerEvaluator({
        apiKey: 'test-key',
        model: 'test-model',
        requestCostUsdMicros: 0,
        fetch: fetcher,
      }).evaluate({ missionDefinitionKey: 'UNKNOWN', answer: '回答' }),
    ).rejects.toThrow('unknown training mission definition');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
