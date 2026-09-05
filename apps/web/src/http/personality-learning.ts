import 'server-only';
import {
  ApprovePersonalityLearningProposal,
  ListPersonalityLearningProposals,
  RejectPersonalityLearningProposal,
  RevokePersonalityLearningProposal,
  type PersonalityLearningProposal,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

async function actorUserId() {
  const current = await (await currentUserProvider()).getCurrentUser();
  if (!current) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return current.userId;
}

async function repository() {
  const { PrismaPersonalityLearningProposalRepository } = await import('@bunshin/database');
  return new PrismaPersonalityLearningProposalRepository();
}

const dto = (value: PersonalityLearningProposal) => ({
  id: value.id,
  status: value.status,
  proposedContent: value.proposedContent,
  reason: value.reason,
  evidenceCount: value.evidenceIds.length,
  basedOnVersionId: value.basedOnVersionId,
  appliedVersionId: value.appliedVersionId,
  createdAt: value.createdAt,
  decidedAt: value.decidedAt,
  revokedAt: value.revokedAt,
});

async function respond(request: Request, operation: () => Promise<unknown>) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    return Response.json(
      { data: await operation(), requestId },
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

export function listPersonalityLearningProposalsResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
) {
  return respond(request, async () =>
    (
      await new ListPersonalityLearningProposals(await repository()).execute({
        workspaceId,
        bunshinId,
        actorUserId: await actorUserId(),
      })
    ).map(dto),
  );
}

type Action = 'approve' | 'reject' | 'revoke';

export function actOnPersonalityLearningProposalResponse(
  request: Request,
  workspaceId: string,
  bunshinId: string,
  proposalId: string,
  action: Action,
) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const input = { workspaceId, bunshinId, proposalId, actorUserId: await actorUserId() };
    const value =
      action === 'approve'
        ? await new ApprovePersonalityLearningProposal(await repository()).execute(input)
        : action === 'reject'
          ? await new RejectPersonalityLearningProposal(await repository()).execute(input)
          : await new RevokePersonalityLearningProposal(await repository()).execute(input);
    return 'proposal' in value ? dto(value.proposal) : dto(value);
  });
}
