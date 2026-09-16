import { listFortuneHistoryResponse } from '../../../../../../src/http/fortune';

export const dynamic = 'force-dynamic';
export const GET = (request: Request, context: { params: Promise<{ serviceSlug: string }> }) =>
  context.params.then(({ serviceSlug }) => listFortuneHistoryResponse(request, serviceSlug));
