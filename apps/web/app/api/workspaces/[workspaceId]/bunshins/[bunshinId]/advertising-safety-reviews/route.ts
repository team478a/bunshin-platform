import {
  createSafetyReviewResponse,
  listSafetyReviewsResponse,
} from '../../../../../../../src/http/advertising-safety';

type Context = { params: Promise<{ workspaceId: string; bunshinId: string }> };
export function GET(request: Request, context: Context) {
  return context.params.then(({ workspaceId, bunshinId }) =>
    listSafetyReviewsResponse(request, workspaceId, bunshinId),
  );
}
export function POST(request: Request, context: Context) {
  return context.params.then(({ workspaceId, bunshinId }) =>
    createSafetyReviewResponse(request, workspaceId, bunshinId),
  );
}
