import { updateServiceSettingsResponse } from '../../../../../src/http/service-settings';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ serviceSlug: string }> },
) {
  return updateServiceSettingsResponse(request, (await params).serviceSlug);
}
