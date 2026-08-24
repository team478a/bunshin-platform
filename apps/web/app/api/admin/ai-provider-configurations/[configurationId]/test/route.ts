import { testAiProviderConfigurationResponse } from '../../../../../../src/http/ai-provider-configurations';

export function POST(request: Request, context: { params: Promise<{ configurationId: string }> }) {
  return context.params.then(({ configurationId }) =>
    testAiProviderConfigurationResponse(request, configurationId),
  );
}
