import { downloadSocialImageResponse } from '../../../../../../../../../../../../../src/http/social-images';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; groupId: string; requestId: string }> },
) {
  const params = await context.params;
  return downloadSocialImageResponse(request, params.workspaceId, params.groupId, params.requestId);
}
