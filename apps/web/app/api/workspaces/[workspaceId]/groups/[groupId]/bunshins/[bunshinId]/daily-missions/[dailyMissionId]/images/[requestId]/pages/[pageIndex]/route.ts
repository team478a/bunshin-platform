import { reviseSocialImagePageResponse } from '../../../../../../../../../../../../../../src/http/social-image-page-revisions';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      workspaceId: string;
      groupId: string;
      requestId: string;
      pageIndex: string;
    }>;
  },
) {
  const params = await context.params;
  return reviseSocialImagePageResponse(
    request,
    params.workspaceId,
    params.groupId,
    params.requestId,
    params.pageIndex,
  );
}
