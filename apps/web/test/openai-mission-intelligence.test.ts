import { describe, expect, it, vi } from 'vitest';
import { OpenAIMissionContentGenerator } from '../src/providers/openai-mission-content-generator';
import { OpenAIMissionQualityChecker } from '../src/providers/openai-mission-quality-checker';

const brief = {
  missionDate: '2026-08-21',
  format: 'TEXT' as const,
  topic: 'テーマ',
  angle: '切り口',
  reason: '理由',
  estimatedMinutes: 5,
};
const base = {
  platform: 'X' as const,
  brief,
  bunshin: {
    name: 'BUNSHIN',
    objectiveSummary: '継続',
    audienceSummary: '初心者',
    personalitySummary: '丁寧',
    personality: {
      versionId: 'personality-version-2',
      version: 2,
      tone: 'やさしい',
      formality: 'ふつう',
      energyLevel: '落ち着いている',
      expertiseLevel: '初心者向け',
      sentenceStyle: '短い文',
      firstPerson: 'わたし',
      forbiddenExpressions: ['絶対'],
      preferredExpressions: ['いっしょに'],
      visualDirection: null,
      facePolicy: 'FULL_ANONYMOUS' as const,
    },
  },
  approvedStrategy: {
    concept: '専門家型',
    positioning: '実践者',
    targetSummary: '初心者',
    ctaStrategy: 'プロフィール',
    postingPolicy: '平日',
  },
  selectedMemories: [
    {
      id: 'memory-1',
      type: 'EXPERIENCE' as const,
      summary: '副業を始めた経験',
      content: '最初は毎日5分だけ発信した',
      selectionReason: 'Missionとの関連語 2件・重要度 4/5',
    },
  ],
};

describe('OpenAIMissionContentGenerator', () => {
  it('uses the format-specific strict schema and store false', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'gpt-5.2',
          usage: { input_tokens: 100, output_tokens: 50 },
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    body: '本文',
                    threadParts: [],
                    cta: null,
                    caption: null,
                    hashtags: [],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await new OpenAIMissionContentGenerator({
      apiKey: 'test-key',
      fetch: fetcher,
    }).generate({
      ...base,
      contentPillar: { title: '実践', description: null },
      grantedKnowledge: [],
    });
    expect(result).toMatchObject({
      promptVersion: 'mission-content-generator-v3',
      inputTokens: 100,
      outputTokens: 50,
    });
    const request = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string) as {
      store: boolean;
      text: { format: { strict: boolean; name: string; schema: { properties: object } } };
    };
    expect(request.store).toBe(false);
    expect(request.text.format).toMatchObject({
      strict: true,
      name: 'mission_content_text',
    });
    expect(JSON.stringify(request)).toContain('personality-version-2');
    expect(JSON.stringify(request)).toContain('絶対');
    expect(JSON.stringify(request)).toContain('最初は毎日5分だけ発信した');
    expect(Object.keys(request.text.format.schema.properties)).toEqual([
      'body',
      'threadParts',
      'cta',
      'caption',
      'hashtags',
    ]);
  });

  it('surfaces provider failures without returning partial content', async () => {
    const generator = new OpenAIMissionContentGenerator({
      apiKey: 'test-key',
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { message: 'unavailable' } }), { status: 503 }),
        ),
    });
    await expect(
      generator.generate({
        ...base,
        contentPillar: { title: '実践', description: null },
        grantedKnowledge: [],
      }),
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_UNAVAILABLE' });
  });

  it('classifies rate limits and network timeouts', async () => {
    const rateLimited = new OpenAIMissionContentGenerator({
      apiKey: 'test-key',
      fetch: vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ error: {} }), { status: 429 })),
    });
    await expect(
      rateLimited.generate({
        ...base,
        contentPillar: { title: '実践', description: null },
        grantedKnowledge: [],
      }),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
      cause: { category: 'RATE_LIMIT', status: 429 },
    });
    const timedOut = new OpenAIMissionContentGenerator({
      apiKey: 'test-key',
      fetch: vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')),
    });
    await expect(
      timedOut.generate({
        ...base,
        contentPillar: { title: '実践', description: null },
        grantedKnowledge: [],
      }),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
      cause: { category: 'TIMEOUT_OR_NETWORK' },
    });
  });
});

describe('OpenAIMissionQualityChecker', () => {
  it('returns strict quality metadata', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'gpt-5.2',
          usage: { input_tokens: 50, output_tokens: 10 },
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({ verdict: 'PASS', score: 90, issues: [] }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await new OpenAIMissionQualityChecker({
      apiKey: 'test-key',
      fetch: fetcher,
    }).check({
      ...base,
      content: { body: '本文', threadParts: [], cta: null, caption: null, hashtags: [] },
    });
    expect(result).toMatchObject({
      output: { verdict: 'PASS', score: 90, issues: [] },
      promptVersion: 'mission-quality-checker-v3',
    });
    const request = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string) as {
      store: boolean;
      text: { format: { strict: boolean } };
    };
    expect(request).toMatchObject({ store: false, text: { format: { strict: true } } });
  });

  it('surfaces provider failures without an approval result', async () => {
    const checker = new OpenAIMissionQualityChecker({
      apiKey: 'test-key',
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { message: 'unavailable' } }), { status: 503 }),
        ),
    });
    await expect(
      checker.check({
        ...base,
        content: { body: '本文', threadParts: [], cta: null, caption: null, hashtags: [] },
      }),
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_UNAVAILABLE' });
  });
});
