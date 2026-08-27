import { queueVideoRenderResponse } from '../../../../../../../../../src/http/video-projects';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: {
    params: Promise<{ workspaceId: string; groupId: string; videoProjectId: string }>;
  },
) {
  const values = await context.params;
  return queueVideoRenderResponse(
    request,
    values.workspaceId,
    values.groupId,
    values.videoProjectId,
  );
}
