import { pauseAiProviderConfigurationResponse } from '../../../../../../src/http/ai-provider-configurations';

export function POST(request: Request, context: { params: Promise<{ configurationId: string }> }) {
  return context.params.then(({ configurationId }) =>
    pauseAiProviderConfigurationResponse(request, configurationId),
  );
}
