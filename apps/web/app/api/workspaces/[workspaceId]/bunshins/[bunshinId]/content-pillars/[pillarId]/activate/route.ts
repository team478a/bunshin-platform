import { setContentPillarActiveResponse } from '../../../../../../../../../src/http/content-pillars';
type Context = { params: Promise<{ workspaceId: string; bunshinId: string; pillarId: string }> };
export async function POST(request: Request, context: Context) {
  const value = await context.params;
  return setContentPillarActiveResponse(
    request,
    value.workspaceId,
    value.bunshinId,
    value.pillarId,
    true,
  );
}
