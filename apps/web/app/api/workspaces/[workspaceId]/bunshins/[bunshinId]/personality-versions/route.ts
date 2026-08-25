import {
  createPersonalityVersionResponse,
  listPersonalityVersionsResponse,
} from '../../../../../../../src/http/personality-versions';

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; bunshinId: string }> },
) {
  const value = await context.params;
  return listPersonalityVersionsResponse(request, value.workspaceId, value.bunshinId);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; bunshinId: string }> },
) {
  const value = await context.params;
  return createPersonalityVersionResponse(request, value.workspaceId, value.bunshinId);
}
