import { archiveServiceBunshinResponse } from '../../../../../../../src/http/service-bunshins';

export async function POST(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; bunshinId: string }> },
) {
  const { serviceSlug, bunshinId } = await context.params;
  return archiveServiceBunshinResponse(request, serviceSlug, bunshinId);
}
