import { describe, expect, it, vi } from 'vitest';
import {
  OpenAiSocialInsightExtractor,
  type SocialInsightExtractionError,
} from '../src/providers/openai-social-insight-extractor';

const body = (output: unknown) => ({
  model: 'gpt-5.2',
  usage: { input_tokens: 80, output_tokens: 30 },
  output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }],
});

const extraction = {
  detectedPlatform: 'INSTAGRAM',
  observedOn: '2026-09-15',
  periodStart: '2026-09-08',
  periodEnd: '2026-09-14',
  followers: 321,
  reach: 1450,
  impressions: 2100,
  profileViews: 87,
  interactions: 44,
  likes: 30,
  comments: 4,
  saves: 8,
  shares: 2,
  follows: 3,
  confidence: 92,
  note: '',
};

describe('OpenAiSocialInsightExtractor', () => {
  it('sends a stateless high-detail image and returns structured metrics', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(body(extraction)), { status: 200 }));
    const result = await new OpenAiSocialInsightExtractor({
      apiKey: 'test',
      model: 'gpt-5.2',
      fetch: request,
    }).extract({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' });

    expect(result.extraction).toEqual(extraction);
    expect(result.inputTokens).toBe(80);
    const init = request.mock.calls[0]?.[1] as RequestInit;
    if (typeof init.body !== 'string') throw new Error('expected JSON body');
    const sent = JSON.parse(init.body) as {
      store: boolean;
      input: Array<{ content: Array<{ type: string; detail?: string; image_url?: string }> }>;
      text: { format: { type: string; strict: boolean } };
    };
    expect(sent.store).toBe(false);
    expect(sent.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(sent.input[1]?.content[1]).toMatchObject({
      type: 'input_image',
      detail: 'high',
    });
    expect(sent.input[1]?.content[1]?.image_url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('rejects an output with no readable metric', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify(
          body({
            ...extraction,
            followers: null,
            reach: null,
            impressions: null,
            profileViews: null,
            interactions: null,
            likes: null,
            comments: null,
            saves: null,
            shares: null,
            follows: null,
          }),
        ),
        { status: 200 },
      ),
    );
    await expect(
      new OpenAiSocialInsightExtractor({
        apiKey: 'test',
        model: 'gpt-5.2',
        fetch: request,
      }).extract({
        bytes: new Uint8Array([1]),
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({
      category: 'INVALID_OUTPUT',
      retryable: false,
    } satisfies Partial<SocialInsightExtractionError>);
  });
});
