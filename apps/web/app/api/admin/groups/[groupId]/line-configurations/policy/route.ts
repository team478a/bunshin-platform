import { setGroupLinePolicyResponse } from '../../../../../../../src/http/group-line-configurations';

export const PUT = (request: Request, context: { params: Promise<{ groupId: string }> }) =>
  context.params.then(({ groupId }) => setGroupLinePolicyResponse(request, groupId));
