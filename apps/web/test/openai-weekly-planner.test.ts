import { describe, expect, it, vi } from 'vitest';
import { OpenAIWeeklyPlanner } from '../src/providers/openai-weekly-planner';

const input = {
  weekStartDate: '2026-08-17',
  timezone: 'Asia/Tokyo',
  platform: 'X' as const,
  availableMinutes: 5 as const,
  bunshin: {
    name: 'BUNSHIN',
    objectiveSummary: '継続',
    audienceSummary: '初心者',
    personalitySummary: '丁寧',
  },
  approvedStrategy: {
    concept: '専門家型',
    positioning: '実践者',
    targetSummary: '初心者',
    ctaStrategy: 'プロフィール',
    postingPolicy: '平日',
  },
  contentPillars: [{ id: 'pillar-1', title: '実践', description: null, weight: 100 }],
  grantedKnowledge: [{ type: 'SKILL', title: '経験', content: '10年の経験' }],
};

describe('OpenAIWeeklyPlanner', () => {
  it('uses strict Responses Structured Outputs and returns usage metadata', async () => {
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
                    strategySummary: '今週の戦略',
                    items: [
                      {
                        scheduledDate: '2026-08-17',
                        contentPillarId: 'pillar-1',
                        goal: '共感',
                        angle: '失敗談',
                        recommendedFormat: 'TEXT',
                        notes: null,
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await new OpenAIWeeklyPlanner({ apiKey: 'test-key', fetch: fetcher }).generate(
      input,
    );
    expect(result).toMatchObject({
      model: 'gpt-5.2',
      promptVersion: 'weekly-planner-v3',
      inputTokens: 100,
      outputTokens: 50,
    });
    const request = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string) as {
      store: boolean;
      text: { format: { type: string; strict: boolean } };
      input: Array<{ content: string }>;
    };
    expect(request).toMatchObject({
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
    expect(request.input[1]?.content).toContain('10年の経験');
  });

  it('maps provider errors without exposing credentials', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'rate_limit' } }), { status: 429 }),
      );
    await expect(
      new OpenAIWeeklyPlanner({ apiKey: 'secret', fetch: fetcher }).generate(input),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
