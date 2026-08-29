import { importGroupBadgeCsvResponse } from '../../../../../../../../src/http/group-badge-import';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; groupId: string }> },
) {
  const params = await context.params;
  return importGroupBadgeCsvResponse(request, params.workspaceId, params.groupId);
}
