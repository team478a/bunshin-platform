import { testGroupLineConfigurationResponse } from '../../../../../../../../src/http/group-line-configurations';

export const POST = (
  request: Request,
  context: { params: Promise<{ groupId: string; configurationId: string }> },
) =>
  context.params.then(({ groupId, configurationId }) =>
    testGroupLineConfigurationResponse(request, groupId, configurationId),
  );
