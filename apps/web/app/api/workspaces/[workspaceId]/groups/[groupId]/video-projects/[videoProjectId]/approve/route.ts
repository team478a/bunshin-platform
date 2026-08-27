import { approveVideoPlanResponse } from '../../../../../../../../../src/http/video-projects';

export async function POST(
  request: Request,
  context: {
    params: Promise<{ workspaceId: string; groupId: string; videoProjectId: string }>;
  },
) {
  const { workspaceId, groupId, videoProjectId } = await context.params;
  return approveVideoPlanResponse(request, workspaceId, groupId, videoProjectId);
}
