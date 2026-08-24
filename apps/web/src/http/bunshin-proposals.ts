import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import {
  OpenAIBunshinProposalGenerator,
  type BunshinProposal,
  type BunshinProposalInput,
} from '../providers/openai-bunshin-proposal-generator';

const schema = z
  .object({
    goal: z.enum(['CONSISTENCY', 'LEADS', 'EXPERTISE', 'SALES', 'RECRUITING']),
    audience: z.enum([
      'BEGINNERS',
      'PEERS',
      'SOLE_PROPRIETORS',
      'EXECUTIVES',
      'CUSTOMERS',
      'UNDECIDED',
    ]),
    tone: z.enum(['FRIENDLY', 'TRUSTED', 'PASSIONATE', 'CALM', 'PLAYFUL']),
  })
  .strict();

const labels = {
  goal: {
    CONSISTENCY: 'SNS発信を続けたい',
    LEADS: '相談や問い合わせを増やしたい',
    EXPERTISE: '専門知識を伝えたい',
    SALES: '商品・サービスを紹介したい',
    RECRUITING: '採用につなげたい',
  },
  audience: {
    BEGINNERS: 'その分野の初心者',
    PEERS: '同業者・専門家',
    SOLE_PROPRIETORS: '個人事業主',
    EXECUTIVES: '経営者',
    CUSTOMERS: '既存・見込み顧客',
    UNDECIDED: 'まだ決まっていない',
  },
  tone: {
    FRIENDLY: '親しみやすい',
    TRUSTED: '信頼できる専門家',
    PASSIONATE: '熱意がある',
    CALM: '落ち着いて丁寧',
    PLAYFUL: '明るく楽しい',
  },
} as const;

function fallback(input: BunshinProposalInput): BunshinProposal[] {
  return [
    {
      name: 'やさしい伴走者',
      type: 'COPY',
      tagline: '共感から始める、続けやすい発信',
      objectiveSummary: input.goal,
      audienceSummary: input.audience,
      personalitySummary: `${input.tone}。相手に寄り添い、難しい言葉を避けて話す。`,
    },
    {
      name: '整理する専門家',
      type: 'EXPERT',
      tagline: '知識を、すぐ使える形に変える',
      objectiveSummary: input.goal,
      audienceSummary: input.audience,
      personalitySummary: `${input.tone}。結論と具体例を示し、分かりやすく説明する。`,
    },
    {
      name: '行動を生む企画役',
      type: 'BRAND',
      tagline: '次の一歩が見える発信を考える',
      objectiveSummary: input.goal,
      audienceSummary: input.audience,
      personalitySummary: `${input.tone}。前向きで簡潔に、実践できる提案をする。`,
    },
  ];
}

export async function bunshinProposalsResponse(
  request: Request,
  workspaceId: string,
): Promise<Response> {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const db = await import('@bunshin/database');
    const workspaces = await db.listActiveWorkspacesForUser(user.userId);
    if (!workspaces.some(({ id }) => id === workspaceId))
      throw new ApplicationError('NOT_FOUND', 'workspace not found');
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
    const input = {
      goal: labels.goal[parsed.data.goal],
      audience: labels.audience[parsed.data.audience],
      tone: labels.tone[parsed.data.tone],
    };
    let proposals: BunshinProposal[];
    let source: 'AI' | 'FALLBACK' = 'FALLBACK';
    try {
      const { apiKey, model } = await resolveOpenAiRuntimeConfiguration();
      try {
        proposals = await new OpenAIBunshinProposalGenerator({
          apiKey,
          model,
        }).generate(input);
        source = 'AI';
      } catch {
        proposals = fallback(input);
      }
    } catch {
      proposals = fallback(input);
    }
    return Response.json(
      { data: { proposals, source }, requestId },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'no-store' },
    });
  }
}
