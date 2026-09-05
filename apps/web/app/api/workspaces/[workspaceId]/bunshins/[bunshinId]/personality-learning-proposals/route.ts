import { listPersonalityLearningProposalsResponse } from '../../../../../../../src/http/personality-learning';

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; bunshinId: string }> },
) {
  const value = await context.params;
  return listPersonalityLearningProposalsResponse(request, value.workspaceId, value.bunshinId);
}
