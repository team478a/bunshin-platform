import { describe, expect, it, vi } from 'vitest';
import { OpenAIMemberProductSuggestionGenerator } from '../src/providers/openai-member-product-suggestion-generator';

const input = {
  platform: 'INSTAGRAM' as const,
  product: { name: '商品A', appealPoint: '毎日使いやすい', targetAudience: '初心者' },
  officialProduct: {
    name: '公式商品A',
    summary: '公式に確認された概要',
    providerName: 'サンプル社',
    targetCustomer: '習慣を整えたい方',
    facts: { capacity: '30個' },
    suitableFor: ['毎日続けたい方'],
    unsuitableFor: ['対象外の方'],
    requiredDisclosures: ['提供：サンプル社'],
    forbiddenExpressions: ['必ず効く'],
    conditionalExpressions: [{ value: '期間限定', condition: '販売期間内のみ' }],
  },
  bunshin: {
    name: '案内役',
    objectiveSummary: '分かりやすく伝える',
    audienceSummary: '初めて知る人',
    personalitySummary: '親しみやすい',
    tone: 'やさしい',
    firstPerson: '私',
    preferredExpressions: ['一緒に'],
    forbiddenExpressions: ['絶対'],
  },
};

describe('OpenAIMemberProductSuggestionGenerator', () => {
  it('returns exactly three drafts and does not store provider output', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'configured-model',
          usage: { input_tokens: 100, output_tokens: 80 },
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    candidates: [{ body: '案A' }, { body: '案B' }, { body: '案C' }],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await new OpenAIMemberProductSuggestionGenerator({
      apiKey: 'secret',
      model: 'configured-model',
      fetch: fetcher,
    }).generate(input);
    const request = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string) as {
      store: boolean;
      input: Array<{ content: string }>;
    };

    expect(request.store).toBe(false);
    expect(request.input[1]?.content).not.toContain('https://');
    expect(request.input[0]?.content).toContain('officialProductを優先');
    expect(request.input[1]?.content).toContain('公式に確認された概要');
    expect(request.input[1]?.content).toContain('提供：サンプル社');
    expect(request.input[1]?.content).toContain('必ず効く');
    expect(result.candidates).toEqual(['案A', '案B', '案C']);
    expect(result.inputTokens).toBe(100);
  });

  it('rejects a provider response with fewer than three drafts', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({ candidates: [{ body: '案A' }] }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(
      new OpenAIMemberProductSuggestionGenerator({ apiKey: 'secret', fetch: fetcher }).generate(
        input,
      ),
    ).rejects.toThrow('invalid output');
  });
});
