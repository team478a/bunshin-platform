import { testAdminEmailConfigurationResponse } from '../../../../../../src/http/admin-email-configurations';
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) =>
  context.params.then(({ id }) => testAdminEmailConfigurationResponse(request, id));
