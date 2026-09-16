import {
  getFortuneOperationsResponse,
  updateFortuneOperationsResponse,
} from '../../../../../src/http/fortune-operations';

export const dynamic = 'force-dynamic';
export const GET = (request: Request, context: { params: Promise<{ serviceSlug: string }> }) =>
  context.params.then(({ serviceSlug }) => getFortuneOperationsResponse(request, serviceSlug));
export const POST = (request: Request, context: { params: Promise<{ serviceSlug: string }> }) =>
  context.params.then(({ serviceSlug }) => updateFortuneOperationsResponse(request, serviceSlug));
