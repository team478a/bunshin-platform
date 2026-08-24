import { describe, expect, it, vi } from 'vitest';
import { OpenAIDailyMissionPlanner } from '../src/providers/openai-daily-mission-planner';

const input = {
  missionDate: '2026-08-21',
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
  weeklyPlanStrategySummary: '今週の戦略',
  weeklyItem: {
    goal: '共感',
    angle: '失敗談',
    recommendedFormat: 'TEXT' as const,
    notes: null,
  },
  contentPillar: { title: '実践', description: null },
  grantedKnowledge: [{ type: 'SKILL', title: '経験', content: '10年の経験' }],
};

describe('OpenAIDailyMissionPlanner', () => {
  it('uses strict Responses Structured Outputs without content fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'gpt-5.2',
          usage: { input_tokens: 90, output_tokens: 30 },
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    topic: '今日のテーマ',
                    angle: '今日の切り口',
                    reason: '選定理由',
                    estimatedMinutes: 5,
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await new OpenAIDailyMissionPlanner({
      apiKey: 'test-key',
      fetch: fetcher,
    }).generate(input);

    expect(result).toMatchObject({
      model: 'gpt-5.2',
      promptVersion: 'daily-mission-planner-v2',
      inputTokens: 90,
      outputTokens: 30,
    });
    const request = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string) as {
      store: boolean;
      text: { format: { type: string; strict: boolean; schema: { properties: object } } };
      input: Array<{ content: string }>;
    };
    expect(request).toMatchObject({
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
    expect(Object.keys(request.text.format.schema.properties)).toEqual([
      'topic',
      'angle',
      'reason',
      'estimatedMinutes',
    ]);
    expect(request.input[1]?.content).toContain('10年の経験');
  });

  it('maps provider errors without exposing credentials', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'rate_limit' } }), { status: 429 }),
      );
    await expect(
      new OpenAIDailyMissionPlanner({ apiKey: 'secret', fetch: fetcher }).generate(input),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
