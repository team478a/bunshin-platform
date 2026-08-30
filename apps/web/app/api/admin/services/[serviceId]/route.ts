import { updateServiceLifecycleResponse } from '../../../../../src/http/services';

export async function PATCH(request: Request, context: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await context.params;
  return updateServiceLifecycleResponse(request, serviceId);
}
