import {
  deleteFortuneBasicProfileResponse,
  getFortuneBasicProfileResponse,
  updateFortuneBasicProfileResponse,
} from '../../../../../../src/http/fortune';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ serviceSlug: string }> };
export const GET = (request: Request, context: Context) =>
  context.params.then(({ serviceSlug }) => getFortuneBasicProfileResponse(request, serviceSlug));
export const PUT = (request: Request, context: Context) =>
  context.params.then(({ serviceSlug }) => updateFortuneBasicProfileResponse(request, serviceSlug));
export const DELETE = (request: Request, context: Context) =>
  context.params.then(({ serviceSlug }) => deleteFortuneBasicProfileResponse(request, serviceSlug));
