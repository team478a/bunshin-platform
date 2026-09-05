import { actOnPersonalityLearningProposalResponse } from '../../../../../../../../../src/http/personality-learning';

const actions = ['approve', 'reject', 'revoke'] as const;

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      workspaceId: string;
      bunshinId: string;
      proposalId: string;
      action: string;
    }>;
  },
) {
  const value = await context.params;
  if (!actions.includes(value.action as (typeof actions)[number]))
    return Response.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  return actOnPersonalityLearningProposalResponse(
    request,
    value.workspaceId,
    value.bunshinId,
    value.proposalId,
    value.action as (typeof actions)[number],
  );
}
