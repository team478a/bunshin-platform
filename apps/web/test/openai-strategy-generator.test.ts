import { describe, expect, it, vi } from 'vitest';
import { OpenAIStrategyGenerator } from '../src/providers/openai-strategy-generator';

const input = {
  wizardTopic: 'SNS運用',
  wizardAudience: '副業初心者',
  platform: 'THREADS' as const,
  goal: 'FOLLOWERS' as const,
  availableMinutes: 5 as const,
  destinationType: 'PROFILE' as const,
  destinationDetail: null,
  bunshin: {
    name: 'BUNSHIN',
    objectiveSummary: '支援',
    audienceSummary: '初心者',
    personalitySummary: '丁寧',
    objectives: [],
    audiences: [],
    personality: null,
  },
  grantedKnowledge: [{ type: 'SKILL', title: '経験', content: '10年の経験' }],
};
describe('OpenAIStrategyGenerator', () => {
  it('uses Responses Structured Outputs and returns usage metadata', async () => {
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
                    concept: 'concept',
                    positioning: 'positioning',
                    targetSummary: 'target',
                    profileDraft: 'profile',
                    ctaStrategy: 'cta',
                    postingPolicy: 'policy',
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await new OpenAIStrategyGenerator({
      apiKey: 'test-key',
      fetch: fetcher,
    }).generate(input);
    expect(result).toMatchObject({
      model: 'gpt-5.2',
      promptVersion: 'social-account-strategy-v1',
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
      new OpenAIStrategyGenerator({ apiKey: 'secret', fetch: fetcher }).generate(input),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
