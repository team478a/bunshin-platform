import { updateFortunePersonalProfileResponse } from '../../../../../../src/http/fortune';

export const dynamic = 'force-dynamic';
export const PUT = (request: Request, context: { params: Promise<{ serviceSlug: string }> }) =>
  context.params.then(({ serviceSlug }) =>
    updateFortunePersonalProfileResponse(request, serviceSlug),
  );
