import { saveServicePostPerformanceResponse } from '../../../../../../../../src/http/service-social-insights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; bunshinId: string }> },
) {
  return context.params.then(({ serviceSlug, bunshinId }) =>
    saveServicePostPerformanceResponse(request, serviceSlug, bunshinId),
  );
}
