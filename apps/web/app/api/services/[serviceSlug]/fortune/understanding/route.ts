import {
  deleteFortuneUnderstandingResponse,
  getFortuneUnderstandingResponse,
  updateFortuneUnderstandingResponse,
} from '../../../../../../src/http/fortune';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ serviceSlug: string }> };
export const GET = (request: Request, context: Context) =>
  context.params.then(({ serviceSlug }) => getFortuneUnderstandingResponse(request, serviceSlug));
export const PUT = (request: Request, context: Context) =>
  context.params.then(({ serviceSlug }) =>
    updateFortuneUnderstandingResponse(request, serviceSlug),
  );
export const DELETE = (request: Request, context: Context) =>
  context.params.then(({ serviceSlug }) =>
    deleteFortuneUnderstandingResponse(request, serviceSlug),
  );
