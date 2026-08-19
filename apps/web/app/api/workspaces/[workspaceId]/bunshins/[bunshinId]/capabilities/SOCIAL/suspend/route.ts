import { setSocialCapabilityStatusResponse } from '../../../../../../../../../src/http/capabilities';

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; bunshinId: string }> },
) {
  const value = await context.params;
  return setSocialCapabilityStatusResponse(request, value.workspaceId, value.bunshinId, false);
}
