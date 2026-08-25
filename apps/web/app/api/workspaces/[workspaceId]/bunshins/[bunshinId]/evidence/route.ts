import {
  createEvidenceResponse,
  listEvidenceResponse,
} from '../../../../../../../src/http/advertising-safety';

type Context = { params: Promise<{ workspaceId: string; bunshinId: string }> };
export function GET(request: Request, context: Context) {
  return context.params.then(({ workspaceId, bunshinId }) =>
    listEvidenceResponse(request, workspaceId, bunshinId),
  );
}
export function POST(request: Request, context: Context) {
  return context.params.then(({ workspaceId, bunshinId }) =>
    createEvidenceResponse(request, workspaceId, bunshinId),
  );
}
