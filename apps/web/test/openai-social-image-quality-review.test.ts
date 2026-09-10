import { describe, expect, it, vi } from 'vitest';
import { OpenAiSocialImageQualityReviewer } from '../src/providers/openai-social-image-quality-review';
import type { OpenAiSocialImageQualityReviewError } from '../src/providers/openai-social-image-quality-review';

const responseBody = (output: unknown) => ({
  model: 'gpt-5.2',
  usage: { input_tokens: 120, output_tokens: 40 },
  output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }],
});

describe('OpenAiSocialImageQualityReviewer', () => {
  it('sends all images in one stateless structured-output review', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify(
          responseBody({
            verdict: 'PASS',
            pages: [
              { pageIndex: 0, verdict: 'PASS', score: 94, issueCodes: [], repairInstruction: '' },
              { pageIndex: 1, verdict: 'PASS', score: 91, issueCodes: [], repairInstruction: '' },
            ],
          }),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await new OpenAiSocialImageQualityReviewer({
      apiKey: 'test',
      model: 'gpt-5.2',
      fetch: request,
    }).review({
      pages: [
        { pageIndex: 0, headline: '表紙', bodyLines: ['説明'], bytes: new Uint8Array([1]) },
        { pageIndex: 1, headline: '悩み', bodyLines: ['説明'], bytes: new Uint8Array([2]) },
      ],
    });

    expect(result.output.verdict).toBe('PASS');
    expect(result.inputTokens).toBe(120);
    const init = request.mock.calls[0]?.[1] as RequestInit;
    if (typeof init.body !== 'string') throw new Error('expected JSON request body');
    const body = JSON.parse(init.body) as {
      store: boolean;
      input: Array<{ role: string; content: Array<{ type: string; image_url?: string }> }>;
      text: { format: { type: string; strict: boolean } };
    };
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(body.input[1]?.content.filter((item) => item.type === 'input_image')).toHaveLength(2);
    expect(body.input[1]?.content[1]?.image_url).toMatch(/^data:image\/png;base64,/);
  });

  it('accepts a revision only when it contains a repair reason and instruction', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify(
          responseBody({
            verdict: 'REVISE',
            pages: [
              {
                pageIndex: 0,
                verdict: 'REVISE',
                score: 65,
                issueCodes: ['UNWANTED_TEXT'],
                repairInstruction: 'Remove all visible lettering.',
              },
            ],
          }),
        ),
        { status: 200 },
      ),
    );
    const result = await new OpenAiSocialImageQualityReviewer({
      apiKey: 'test',
      fetch: request,
    }).review({
      pages: [{ pageIndex: 0, headline: '表紙', bodyLines: [], bytes: new Uint8Array([1]) }],
    });
    expect(result.output.pages[0]).toMatchObject({
      verdict: 'REVISE',
      issueCodes: ['UNWANTED_TEXT'],
    });
  });

  it('rejects missing page decisions instead of silently passing delivery', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify(
          responseBody({
            verdict: 'PASS',
            pages: [
              { pageIndex: 0, verdict: 'PASS', score: 90, issueCodes: [], repairInstruction: '' },
            ],
          }),
        ),
        { status: 200 },
      ),
    );
    await expect(
      new OpenAiSocialImageQualityReviewer({ apiKey: 'test', fetch: request }).review({
        pages: [
          { pageIndex: 0, headline: '表紙', bodyLines: [], bytes: new Uint8Array([1]) },
          { pageIndex: 1, headline: '本文', bodyLines: [], bytes: new Uint8Array([2]) },
        ],
      }),
    ).rejects.toMatchObject({
      category: 'INVALID_OUTPUT',
      retryable: false,
    } satisfies Partial<OpenAiSocialImageQualityReviewError>);
  });
});
