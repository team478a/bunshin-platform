import 'server-only';
import { z } from 'zod';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolvePersonalLearningRequestActor } from '../services/personal-learning-request-access';
import { prepareSideHustleProposal } from '../services/side-hustle-proposal';
import { boundedLearningJson } from './personal-learning-request';

const saveHearingBody = z
  .object({
    hearing: z.unknown(),
    expectedRevision: z.number().int().min(0).max(99),
    operationId: z.string().uuid(),
  })
  .strict();
const proposalBody = z
  .object({
    hearingEventId: z.string().uuid(),
    hearingRevision: z.number().int().positive(),
    operationId: z.string().uuid(),
  })
  .strict();
const selectionBody = z
  .object({
    proposalEventId: z.string().uuid(),
    candidateIndex: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
    confirmed: z.literal(true),
  })
  .strict();

export function projectSideHustleProposalForLearner(
  proposal: Awaited<ReturnType<typeof prepareSideHustleProposal>>,
) {
  const visibleEntries = proposal.screening.entries.filter(({ verdict }) => verdict !== 'EXCLUDED');
  const visibleIndices = new Set(visibleEntries.map(({ candidateIndex }) => candidateIndex));
  return {
    ...proposal,
    proposal: {
      ...proposal.proposal,
      candidates: proposal.proposal.candidates.filter((_candidate, index) =>
        visibleIndices.has(index),
      ),
      removedCandidates: undefined,
      removedQuestionCount: proposal.proposal.removedQuestionCount,
    },
    screening: { ...proposal.screening, entries: visibleEntries },
    removedCandidateCount: proposal.proposal.removedCandidates.length,
  };
}

export async function sideHustleResponse(request: Request, slug: string, enrollmentId: string) {
  const headers = { 'cache-control': 'private, no-store' };
  try {
    if (!['GET', 'PUT', 'POST'].includes(request.method))
      return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers });
    if (request.method !== 'GET') {
      requireSameOrigin(request);
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        throw new ApplicationError('VALIDATION_ERROR', 'JSON required');
    }
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const resolvedActor = await resolvePersonalLearningRequestActor(
      slug,
      enrollmentId,
      user.userId,
      undefined,
      undefined,
      { allowUnselectedTopic: true },
    );
    const actor = { actorUserId: resolvedActor.actorUserId, scope: resolvedActor.scope };
    const db = await import('@bunshin/database');
    const repository = new db.PrismaSideHustleHearingRepository(db.prisma);
    if (request.method === 'GET') {
      const state = await repository.readState(actor);
      return Response.json(
        {
          data: {
            ...state,
            proposal: state.proposal ? projectSideHustleProposalForLearner(state.proposal) : null,
          },
        },
        { headers },
      );
    }
    const raw = await boundedLearningJson(request);
    if (request.method === 'PUT') {
      const input = saveHearingBody.parse(raw);
      const data = await repository.saveHearing({
        actor,
        hearing: input.hearing,
        expectedRevision: input.expectedRevision,
        idempotencyKey: input.operationId,
      });
      return Response.json({ data }, { headers });
    }
    const endpoint = new URL(request.url).pathname;
    if (request.method === 'POST' && endpoint.endsWith('/proposal')) {
      const input = proposalBody.parse(raw);
      const data = await prepareSideHustleProposal(
        actor,
        input.hearingEventId,
        input.hearingRevision,
        input.operationId,
      );
      return Response.json({ data: projectSideHustleProposalForLearner(data) }, { headers });
    }
    const input = selectionBody.parse(raw);
    const data = await repository.select({
      actor,
      proposalEventId: input.proposalEventId,
      candidateIndex: input.candidateIndex,
      idempotencyKey: input.operationId,
    });
    return Response.json({ data }, { headers });
  } catch (error) {
    const mapped = toApiError(
      error instanceof z.ZodError
        ? new ApplicationError('VALIDATION_ERROR', 'invalid side hustle request')
        : error,
      'side-hustle',
    );
    return Response.json(
      {
        error: {
          code: mapped.body.error.code,
          message: '副業の候補を確認できませんでした。ヒアリング内容と受講状態を確認してください。',
        },
      },
      { status: mapped.status, headers },
    );
  }
}
