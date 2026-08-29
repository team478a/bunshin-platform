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

  it('2MBを超えるWebページはAIへ送信しない', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response('本文', {
        status: 200,
        headers: { 'content-type': 'text/html', 'content-length': '2000001' },
      }),
    );
    await expect(
      new OpenAiGroupKnowledgeExtractor({
        apiKey: 'secret',
        model: 'gpt-test',
        fetch: fetcher,
      }).extractUrl({ url: 'https://1.1.1.1/large', title: '大きな資料' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('実際の受信量が2MBを超えた場合も途中で停止する', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(new Uint8Array(2_000_001), {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    await expect(
      new OpenAiGroupKnowledgeExtractor({
        apiKey: 'secret',
        model: 'gpt-test',
        fetch: fetcher,
      }).extractUrl({ url: 'https://1.1.1.1/stream', title: '大きな資料' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('不要部分を除去できれば500KBを超えるHTMLも読み取る', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(`<script>${'x'.repeat(600_000)}</script><main>大切な説明です。</main>`, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(responsePayload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const result = await new OpenAiGroupKnowledgeExtractor({
      apiKey: 'secret',
      model: 'gpt-test',
      fetch: fetcher,
    }).extractUrl({ url: 'https://1.1.1.1/guide', title: '説明資料' });
    expect(result[0]).toMatchObject({ type: 'FACT' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const request = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)) as {
      input: Array<{ content: Array<{ text?: string }> }>;
    };
    expect(request.input[0]?.content.map((item) => item.text).join('\n')).toContain(
      '大切な説明です。',
    );
  });

  it('不要部分を除いた本文が500KBを超える場合は登録を止める', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(`<main>${'あ'.repeat(170_000)}</main>`, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(
      new OpenAiGroupKnowledgeExtractor({
        apiKey: 'secret',
        model: 'gpt-test',
        fetch: fetcher,
      }).extractUrl({ url: 'https://1.1.1.1/long', title: '長い資料' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
