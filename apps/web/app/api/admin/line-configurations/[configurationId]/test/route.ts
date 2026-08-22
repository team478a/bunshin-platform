import { testLineConfigurationResponse } from '../../../../../../src/http/line-configurations';

export function POST(request: Request, context: { params: Promise<{ configurationId: string }> }) {
  return context.params.then(({ configurationId }) =>
    testLineConfigurationResponse(request, configurationId),
  );
}
