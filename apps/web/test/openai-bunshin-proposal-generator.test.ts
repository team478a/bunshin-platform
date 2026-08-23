import { describe, expect, it, vi } from 'vitest';
import { OpenAIBunshinProposalGenerator } from '../src/providers/openai-bunshin-proposal-generator';

const proposals = [
  {
    name: '伴走者',
    type: 'COPY',
    tagline: '続ける',
    objectiveSummary: '発信',
    audienceSummary: '初心者',
    personalitySummary: '親しみやすい',
  },
  {
    name: '専門家',
    type: 'EXPERT',
    tagline: '整理する',
    objectiveSummary: '発信',
    audienceSummary: '初心者',
    personalitySummary: '明快',
  },
  {
    name: '企画役',
    type: 'BRAND',
    tagline: '動かす',
    objectiveSummary: '発信',
    audienceSummary: '初心者',
    personalitySummary: '前向き',
  },
] as const;

describe('OpenAIBunshinProposalGenerator', () => {
  it('returns exactly three structured proposals without storing the response', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [{ content: [{ type: 'output_text', text: JSON.stringify({ proposals }) }] }],
        }),
        { status: 200 },
      ),
    );
    const result = await new OpenAIBunshinProposalGenerator({
      apiKey: 'secret',
      fetch: fetcher,
    }).generate({ goal: '発信', audience: '初心者', tone: '親しみやすい' });
    const request = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string) as { store: boolean };
    expect(request.store).toBe(false);
    expect(result).toHaveLength(3);
    expect(result[1]?.type).toBe('EXPERT');
  });

  it('rejects provider output that does not contain three proposals', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({ proposals: proposals.slice(0, 2) }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    await expect(
      new OpenAIBunshinProposalGenerator({ apiKey: 'secret', fetch: fetcher }).generate({
        goal: '発信',
        audience: '初心者',
        tone: '親しみやすい',
      }),
    ).rejects.toThrow('invalid output');
  });
});
