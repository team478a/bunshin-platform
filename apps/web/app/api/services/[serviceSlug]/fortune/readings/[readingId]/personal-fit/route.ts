import { updateFortunePersonalFitResponse } from '../../../../../../../../src/http/fortune';

export const dynamic = 'force-dynamic';
export const PUT = (
  request: Request,
  context: { params: Promise<{ serviceSlug: string; readingId: string }> },
) =>
  context.params.then(({ serviceSlug, readingId }) =>
    updateFortunePersonalFitResponse(request, serviceSlug, readingId),
  );
