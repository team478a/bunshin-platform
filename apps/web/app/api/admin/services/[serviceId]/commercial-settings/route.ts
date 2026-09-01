import { updateServiceCommercialSettingsResponse } from '../../../../../../src/http/services';

export async function PUT(request: Request, context: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await context.params;
  return updateServiceCommercialSettingsResponse(request, serviceId);
}
