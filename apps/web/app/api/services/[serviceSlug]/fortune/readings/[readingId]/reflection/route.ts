import { updateFortuneReflectionResponse } from '../../../../../../../../src/http/fortune';

export const dynamic = 'force-dynamic';
export const PUT = (
  request: Request,
  context: { params: Promise<{ serviceSlug: string; readingId: string }> },
) =>
  context.params.then(({ serviceSlug, readingId }) =>
    updateFortuneReflectionResponse(request, serviceSlug, readingId),
  );
