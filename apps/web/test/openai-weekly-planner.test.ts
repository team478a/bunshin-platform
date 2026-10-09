import { describe, expect, it, vi } from 'vitest';
import { weeklySocialGoalPlanningProfile } from '@bunshin/capability-social';
import { OpenAIWeeklyPlanner } from '../src/providers/openai-weekly-planner';
import { providerTransportCases } from './provider-transport-cases';

const input = {
  weekStartDate: '2026-08-17',
  timezone: 'Asia/Tokyo',
  platform: 'X' as const,
  availableMinutes: 5 as const,
  bunshin: {
    name: '投稿パートナー',
    objectiveSummary: '継続',
    audienceSummary: '初心者',
    personalitySummary: '丁寧',
  },
  approvedStrategy: {
    goal: 'INQUIRY' as const,
    goalPlanning: weeklySocialGoalPlanningProfile('INQUIRY'),
    concept: '専門家型',
    positioning: '実践者',
    targetSummary: '初心者',
    ctaStrategy: 'プロフィール',
    postingPolicy: '平日',
  },
  contentPillars: [{ id: 'pillar-1', title: '実践', description: null, weight: 100 }],
  grantedKnowledge: [{ type: 'SKILL', title: '経験', content: '10年の経験' }],
  recentPerformance: {
    periodDays: 28,
    postedCount: 2,
    feedback: { good: 1, neutral: 1, bad: 0 },
    formats: [],
    goalEvaluation: {
      goal: 'INQUIRY' as const,
      status: 'MEASURED' as const,
      primaryOutcomeKeys: ['inquiries' as const],
      recordedPostCount: 2,
      primaryOutcomeTotal: 2,
      feedbackMeaning: 'CONTENT_PREFERENCE_NOT_GOAL_ACHIEVEMENT' as const,
      limitations: ['因果関係は未確認'],
    },
    businessOutcomes: {
      inquiries: 2,
      reservations: 0,
      visits: 0,
      repeatReservations: 0,
      repeatVisits: 0,
      orders: 0,
      other: 0,
    },
    successfulTopics: [
      {
        topic: '初回相談の流れ',
        outcomeTotal: 2,
        businessOutcomes: {
          inquiries: 2,
          reservations: 0,
          visits: 0,
          repeatReservations: 0,
          repeatVisits: 0,
          orders: 0,
          other: 0,
        },
      },
    ],
  },
};

describe('OpenAIWeeklyPlanner', () => {
  it('rejects an unregistered model before a Provider call', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      new OpenAIWeeklyPlanner({
        apiKey: 'synthetic',
        model: 'unknown-model',
        fetch: fetcher,
      }).generate(input),
    ).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
      cause: { reason: 'MODEL_NOT_REGISTERED' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['gpt-5.2', 'gpt-5.2-2025-12-11', 'gpt-5-mini', 'gpt-5-mini-2025-08-07'])(
    'uses strict Responses Structured Outputs and returns usage metadata for %s',
    async (model) => {
      const fetcher = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model,
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
                          campaignId: null,
                          classification: 'ORGANIC',
                          businessContentCategory: null,
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
      const result = await new OpenAIWeeklyPlanner({
        apiKey: 'test-key',
        model,
        fetch: fetcher,
      }).generate(input);
      expect(result).toMatchObject({
        model,
        promptVersion: 'weekly-planner-v8-goal-outcomes',
        inputTokens: 100,
        outputTokens: 50,
      });
      const request = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string) as {
        store: boolean;
        text: {
          format: {
            type: string;
            strict: boolean;
            schema: { properties: { items: { items: { properties: object } } } };
          };
        };
        input: Array<{ content: string }>;
      };
      expect(request).toMatchObject({
        store: false,
        text: { format: { type: 'json_schema', strict: true } },
      });
      expect(request.input[2]?.content).toContain('10年の経験');
      expect(request.input[2]?.content).toContain('初回相談の流れ');
      expect(request.input[2]?.content).toContain('対象顧客の課題を具体化し');
      expect(request.input[2]?.content).toContain('問い合わせる');
      expect(request.input[2]?.content).toContain('CONTENT_PREFERENCE_NOT_GOAL_ACHIEVEMENT');
      expect(request.input[0]?.content).toContain('成果数字は内部の企画判断だけに使い');
      expect(request.input[0]?.content).toContain('CTAの末尾だけでなく');
      expect(request.input[1]?.content).toContain('GOOD・NEUTRAL・BADは内容の好み');
      expect(Object.keys(request.text.format.schema.properties.items.items.properties)).toContain(
        'businessContentCategory',
      );
    },
  );

  it('maps provider errors without exposing credentials', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'rate_limit' } }), { status: 429 }),
      );
    await expect(
      new OpenAIWeeklyPlanner({ apiKey: 'secret', fetch: fetcher }).generate(input),
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_UNAVAILABLE' });
  });

  providerTransportCases((fetcher) =>
    new OpenAIWeeklyPlanner({ apiKey: 'synthetic-key', fetch: fetcher }).generate(input),
  );
});
