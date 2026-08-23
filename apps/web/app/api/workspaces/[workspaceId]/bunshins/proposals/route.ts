import { bunshinProposalsResponse } from '../../../../../../src/http/bunshin-proposals';

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  return bunshinProposalsResponse(request, (await context.params).workspaceId);
}
