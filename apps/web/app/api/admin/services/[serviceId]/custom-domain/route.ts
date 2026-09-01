import { updateServiceCustomDomainResponse } from '../../../../../../src/http/services';

export async function PUT(request: Request, context: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await context.params;
  return updateServiceCustomDomainResponse(request, serviceId);
}
