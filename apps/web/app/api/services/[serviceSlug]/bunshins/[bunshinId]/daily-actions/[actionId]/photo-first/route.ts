import { generateServicePhotoFirstResponse } from '../../../../../../../../../src/http/service-daily-actions';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: {
    params: Promise<{ serviceSlug: string; bunshinId: string; actionId: string }>;
  },
) {
  const { serviceSlug, bunshinId, actionId } = await context.params;
  return generateServicePhotoFirstResponse(request, serviceSlug, bunshinId, actionId);
}
