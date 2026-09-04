import { publishDefaultGroupRichMenuResponse } from '../../../../../../../src/http/group-line-configurations';

export const dynamic = 'force-dynamic';
export const POST = (request: Request, context: { params: Promise<{ groupId: string }> }) =>
  context.params.then(({ groupId }) => publishDefaultGroupRichMenuResponse(request, groupId));
