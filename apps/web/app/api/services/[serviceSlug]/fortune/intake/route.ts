import {
  nextFortuneIntakeResponse,
  startFortuneIntakeResponse,
} from '../../../../../../src/http/fortune';

export const dynamic = 'force-dynamic';
export const PATCH = (request: Request, context: { params: Promise<{ serviceSlug: string }> }) =>
  context.params.then(({ serviceSlug }) => startFortuneIntakeResponse(request, serviceSlug));
export const POST = (request: Request, context: { params: Promise<{ serviceSlug: string }> }) =>
  context.params.then(({ serviceSlug }) => nextFortuneIntakeResponse(request, serviceSlug));
