import {
  joinFortuneResponse,
  updateFortunePersonalizationResponse,
} from '../../../../../../src/http/fortune';

export const dynamic = 'force-dynamic';
export const POST = (request: Request, context: { params: Promise<{ serviceSlug: string }> }) =>
  context.params.then(({ serviceSlug }) => joinFortuneResponse(request, serviceSlug));
export const PUT = (request: Request, context: { params: Promise<{ serviceSlug: string }> }) =>
  context.params.then(({ serviceSlug }) =>
    updateFortunePersonalizationResponse(request, serviceSlug),
  );
