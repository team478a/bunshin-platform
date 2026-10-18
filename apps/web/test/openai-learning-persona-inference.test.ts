import { describe, expect, it, vi } from 'vitest';
import {
  generatePersonaInference,
  personaInferenceBody,
  validatePersonaInferenceOutput,
} from '../src/providers/openai-learning-persona-inference';

const source = {
  evidenceType: 'CONVERSATION_EVENT' as const,
  evidenceId: 'evidence-1',
  occurredAt: new Date('2026-10-18T00:00:00.000Z'),
  text: '短い手順で一つずつ試したい',
};

describe('persona inference provider', () => {
  it('uses the allowlisted learning-only output contract and non-storage mode', () => {
    const body = personaInferenceBody({
      model: 'gpt-5.2-2025-12-11',
      maxOutputTokens: 300,
      maxRequestBytes: 6000,
      maxSourceBytes: 1000,
      sources: [source],
    });
    const request = JSON.parse(body) as {
      store: boolean;
      max_output_tokens: number;
      input: { role: string; content: string }[];
    };
    expect(request.store).toBe(false);
    expect(request.max_output_tokens).toBe(300);
    expect(request.input.find(({ role }) => role === 'system')?.content).toContain('住所');
    expect(JSON.parse(request.input.find(({ role }) => role === 'user')!.content)).toMatchObject({
      sources: [{ sourceIndex: 0, text: source.text }],
    });
    expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(6000);
  });

  it.each([
    { items: [{ attributeKey: 'company_name', value: 'Example Co.', sourceIndex: 0 }] },
    {
      items: [
        { attributeKey: 'learning_purpose', value: '東京都渋谷区1丁目2番地', sourceIndex: 0 },
      ],
    },
    { items: [{ attributeKey: 'learning_purpose', value: '私は糖尿病と診断', sourceIndex: 0 }] },
    {
      items: [{ attributeKey: 'learning_purpose', value: '同僚の田中さんと学ぶ', sourceIndex: 0 }],
    },
  ])('rejects disallowed model output: %j', (value) => {
    expect(() => validatePersonaInferenceOutput(value)).toThrow();
  });

  it('records usage from the mocked provider call without using a real API key', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        status: 'completed',
        model: 'gpt-5.2-2025-12-11',
        usage: { input_tokens: 50, output_tokens: 20, input_tokens_details: { cached_tokens: 0 } },
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  items: [
                    { attributeKey: 'explanation_style', value: '短い手順を好む', sourceIndex: 0 },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    );
    const body = personaInferenceBody({
      model: 'gpt-5.2-2025-12-11',
      maxOutputTokens: 300,
      maxRequestBytes: 6000,
      maxSourceBytes: 1000,
      sources: [source],
    });
    const result = await generatePersonaInference({
      apiKey: 'test-only',
      model: 'gpt-5.2-2025-12-11',
      body,
      fetch: fetcher,
    });
    expect(result.value).toEqual([
      { attributeKey: 'explanation_style', value: '短い手順を好む', sourceIndex: 0 },
    ]);
    expect(result.measurement).toMatchObject({ success: true, inputTokens: 50, outputTokens: 20 });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
