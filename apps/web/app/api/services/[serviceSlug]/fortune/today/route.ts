import { drawFortuneResponse, getFortuneTodayResponse } from '../../../../../../src/http/fortune';

export const dynamic = 'force-dynamic';
export const GET = (request: Request, context: { params: Promise<{ serviceSlug: string }> }) =>
  context.params.then(({ serviceSlug }) => getFortuneTodayResponse(request, serviceSlug));
export const POST = (request: Request, context: { params: Promise<{ serviceSlug: string }> }) =>
  context.params.then(({ serviceSlug }) => drawFortuneResponse(request, serviceSlug));
