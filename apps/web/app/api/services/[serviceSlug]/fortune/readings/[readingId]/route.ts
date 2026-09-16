import {
  deleteFortuneReadingResponse,
  getFortuneReadingResponse,
} from '../../../../../../../src/http/fortune';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ serviceSlug: string; readingId: string }> };
export const GET = (request: Request, context: Context) =>
  context.params.then(({ serviceSlug, readingId }) =>
    getFortuneReadingResponse(request, serviceSlug, readingId),
  );
export const DELETE = (request: Request, context: Context) =>
  context.params.then(({ serviceSlug, readingId }) =>
    deleteFortuneReadingResponse(request, serviceSlug, readingId),
  );
