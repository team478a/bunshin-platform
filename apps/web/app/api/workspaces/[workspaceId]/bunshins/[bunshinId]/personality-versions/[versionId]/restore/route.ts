import { restorePersonalityVersionResponse } from '../../../../../../../../../src/http/personality-versions';

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; bunshinId: string; versionId: string }> },
) {
  const value = await context.params;
  return restorePersonalityVersionResponse(
    request,
    value.workspaceId,
    value.bunshinId,
    value.versionId,
  );
}
