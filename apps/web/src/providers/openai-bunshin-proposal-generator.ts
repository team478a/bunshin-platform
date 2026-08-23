import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';

export const BUNSHIN_PROPOSAL_PROMPT_VERSION = 'bunshin-onboarding-proposals-v1';

export type BunshinProposalInput = {
  goal: string;
  audience: string;
  tone: string;
};

export type BunshinProposal = {
  name: string;
  type: 'COPY' | 'EXPERT' | 'BRAND' | 'CHARACTER';
  tagline: string;
  objectiveSummary: string;
  audienceSummary: string;
  personalitySummary: string;
};

const outputSchema = z.object({
  proposals: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        type: z.enum(['COPY', 'EXPERT', 'BRAND', 'CHARACTER']),
        tagline: z.string().min(1).max(160),
        objectiveSummary: z.string().min(1).max(1000),
        audienceSummary: z.string().min(1).max(1000),
        personalitySummary: z.string().min(1).max(1000),
      }),
    )
    .length(3),
});

const proposalSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    proposals: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['COPY', 'EXPERT', 'BRAND', 'CHARACTER'] },
          tagline: { type: 'string' },
          objectiveSummary: { type: 'string' },
          audienceSummary: { type: 'string' },
          personalitySummary: { type: 'string' },
        },
        required: [
          'name',
          'type',
          'tagline',
          'objectiveSummary',
          'audienceSummary',
          'personalitySummary',
        ],
      },
    },
  },
  required: ['proposals'],
} as const;

type OpenAIResponse = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: unknown;
};

export class OpenAIBunshinProposalGenerator {
  constructor(private readonly options: { apiKey: string; model?: string; fetch?: typeof fetch }) {}

  async generate(input: BunshinProposalInput): Promise<BunshinProposal[]> {
    const response = await (this.options.fetch ?? fetch)('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.options.model ?? 'gpt-5.2',
        store: false,
        input: [
          {
            role: 'system',
            content:
              'あなたはBUNSHIN設計担当です。選択回答だけを使い、初心者が違いを判断しやすい日本語のBUNSHIN案を必ず3つ作成してください。3案は役割と個性を明確に変え、誇張や未提供の個人情報を加えないでください。',
          },
          { role: 'user', content: JSON.stringify(input) },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'bunshin_proposals',
            strict: true,
            schema: proposalSchema,
          },
        },
      }),
    });
    const value = (await response.json()) as OpenAIResponse;
    if (!response.ok)
      throw new ApplicationError('INTERNAL_ERROR', 'proposal provider failed', value.error);
    const outputText = value.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === 'output_text')?.text;
    if (!outputText)
      throw new ApplicationError('INTERNAL_ERROR', 'proposal provider returned no output');
    try {
      return outputSchema.parse(JSON.parse(outputText)).proposals;
    } catch (error) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'proposal provider returned invalid output',
        error,
      );
    }
  }
}
