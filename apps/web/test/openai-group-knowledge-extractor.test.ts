import { describe, expect, it, vi } from 'vitest';
import { OpenAiGroupKnowledgeExtractor } from '../src/providers/openai-group-knowledge-extractor';

const responsePayload = {
  output: [
    {
      content: [
        {
          type: 'output_text',
          text: JSON.stringify({
            chunks: [
              {
                type: 'FACT',
                content: '返品は7日以内です。',
                sourceLabel: 'FAQ 1ページ',
                pageNumber: 1,
                confidence: 1,
              },
            ],
          }),
        },
      ],
    },
  ],
};

describe('OpenAiGroupKnowledgeExtractor', () => {
  it('PDFをstoreせず構造化して読み取る', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await new OpenAiGroupKnowledgeExtractor({
      apiKey: 'secret',
      model: 'gpt-test',
      fetch: fetcher,
    }).extractPdf({ fileUrl: 'https://signed.example/file.pdf', title: '商品FAQ' });
    expect(result[0]).toMatchObject({ type: 'FACT', pageNumber: 1 });
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      store: boolean;
      input: Array<{ content: Array<{ type: string; file_url?: string }> }>;
    };
    expect(request.store).toBe(false);
    expect(request.input[0]?.content[1]).toMatchObject({
      type: 'input_file',
      file_url: 'https://signed.example/file.pdf',
    });
  });

  it('25MBを超える動画は外部送信前に拒否する', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array(25_000_001), { status: 200 }));
    await expect(
      new OpenAiGroupKnowledgeExtractor({
        apiKey: 'secret',
        model: 'gpt-test',
        fetch: fetcher,
      }).extractVideo({
        fileUrl: 'https://signed.example/video.mp4',
        title: '研修動画.mp4',
        mimeType: 'video/mp4',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
