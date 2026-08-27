import { generateVideoPlanResponse } from '../../../../../../../../../src/http/video-projects';

type Context = {
  params: Promise<{ workspaceId: string; groupId: string; videoProjectId: string }>;
};

export async function POST(request: Request, context: Context) {
  const { workspaceId, groupId, videoProjectId } = await context.params;
  return generateVideoPlanResponse(request, workspaceId, groupId, videoProjectId);
}
