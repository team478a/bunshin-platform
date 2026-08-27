import { describe, expect, it, vi } from 'vitest';
import type { VideoPlanGeneratorInput } from '@bunshin/application';
import { OpenAIVideoPlanGenerator } from '../src/providers/openai-video-plan-generator';

const input: VideoPlanGeneratorInput = {
  project: {
    title: '30秒の商品紹介',
    platform: 'INSTAGRAM' as const,
    type: 'PRODUCT_INTRODUCTION' as const,
    durationSeconds: 30 as const,
    standardComposition: true,
  },
  context: {
    objective: '商品の特徴を伝える',
    audience: '初心者',
    personality: {
      tone: 'やさしい',
      preferredExpressions: ['いっしょに'],
      prohibitedExpressions: ['絶対'],
    },
    product: {
      name: '公式商品',
      facts: ['内容量100g'],
      requiredDisclosures: ['#PR'],
      prohibitedExpressions: ['必ず成功'],
    },
    approvedAssets: [{ assetId: 'asset-1', description: '商品正面写真' }],
    userAssets: [{ assetId: 'user-asset-1', kind: 'IMAGE', description: '本人の商品写真' }],
  },
};

const output = {
  scenes: Array.from({ length: 5 }, (_, index) => ({
    sceneNo: index + 1,
    durationMs: 6_000,
    narration: `場面${index + 1}の説明`,
    caption: `場面${index + 1}`,
    visualType: 'TEXT_MOTION',
    visualPrompt: null,
    keywords: ['商品'],
    aiProcessingTypes: ['SCRIPT_GENERATION'],
  })),
  projectAiProcessingTypes: ['SCRIPT_GENERATION'],
};

describe('OpenAIVideoPlanGenerator', () => {
  it('uses strict structured output and excludes AI video from the standard schema', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'gpt-5.2',
          usage: { input_tokens: 100, output_tokens: 200 },
          output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }],
        }),
        { status: 200 },
      ),
    );
    const result = await new OpenAIVideoPlanGenerator({
      apiKey: 'test-key',
      fetch: fetcher,
    }).generate(input);
    expect(result).toMatchObject({
      promptVersion: 'video-plan-v1',
      inputTokens: 100,
      outputTokens: 200,
    });
    const request = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string) as {
      store: boolean;
      input: Array<{ content: string }>;
      text: {
        format: {
          strict: boolean;
          schema: {
            properties: {
              scenes: { minItems: number; maxItems: number; items: { properties: object } };
            };
          };
        };
      };
    };
    expect(request).toMatchObject({ store: false, text: { format: { strict: true } } });
    expect(request.text.format.schema.properties.scenes).toMatchObject({
      minItems: 5,
      maxItems: 7,
    });
    expect(JSON.stringify(request.text.format.schema)).not.toContain('AI_VIDEO');
    expect(request.input[1]?.content).toContain('asset-1');
    expect(request.input[1]?.content).toContain('#PR');
  });

  it('maps provider failures without exposing the API key', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'rate_limit' } }), { status: 429 }),
      );
    await expect(
      new OpenAIVideoPlanGenerator({ apiKey: 'secret', fetch: fetcher }).generate(input),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
