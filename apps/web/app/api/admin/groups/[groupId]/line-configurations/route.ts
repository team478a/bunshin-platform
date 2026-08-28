import {
  createGroupLineConfigurationResponse,
  listGroupLineConfigurationsResponse,
} from '../../../../../../src/http/group-line-configurations';

export const GET = (request: Request, context: { params: Promise<{ groupId: string }> }) =>
  context.params.then(({ groupId }) => listGroupLineConfigurationsResponse(request, groupId));
export const POST = (request: Request, context: { params: Promise<{ groupId: string }> }) =>
  context.params.then(({ groupId }) => createGroupLineConfigurationResponse(request, groupId));
