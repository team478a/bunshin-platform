import { listServiceAccountStrategiesResponse } from '../../../../../../../src/http/service-account-strategies';

export async function GET(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; bunshinId: string }> },
) {
  const { serviceSlug, bunshinId } = await context.params;
  const socialProfileId = new URL(request.url).searchParams.get('socialProfileId');
  if (!socialProfileId)
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'socialProfileId is required' } },
      { status: 400 },
    );
  return listServiceAccountStrategiesResponse(request, serviceSlug, bunshinId, socialProfileId);
}
