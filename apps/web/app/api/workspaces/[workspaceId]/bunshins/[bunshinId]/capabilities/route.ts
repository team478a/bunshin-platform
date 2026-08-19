import {
  assignCapabilityResponse,
  listCapabilitiesResponse,
} from '../../../../../../../src/http/capabilities';

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; bunshinId: string }> },
) {
  const value = await context.params;
  return listCapabilitiesResponse(request, value.workspaceId, value.bunshinId);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; bunshinId: string }> },
) {
  const value = await context.params;
  return assignCapabilityResponse(request, value.workspaceId, value.bunshinId);
}
