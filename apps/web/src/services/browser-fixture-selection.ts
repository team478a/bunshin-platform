import 'server-only';
import { estimateAiCallCost, type AiCallMeasurement } from '@bunshin/application';
import { browserPreviewChoices, browserPreviewResponseSchema } from '@bunshin/capability-browser';
import { ApplicationError } from '@bunshin/shared';
import { reserveLearningProviderRuntimeConfiguration } from '../ai/learning-provider-runtime';
import { settleProviderRuntimeAdmission } from '../ai/runtime-provider-configuration';
import { recordAiUsage } from '../observability/ai-usage';
import { personalLearningPricingRegistry } from '../observability/personal-learning-ai-call';
import { GoogleLearningGenerationAdapter } from '../providers/google-learning-generation';

const promptVersion = 'browser-fixture-preview-choice-v1';

export async function selectBrowserFixturePreview(input: {
  jobId: string;
  workspaceId: string;
  actorId: string;
  device: 'mobile' | 'desktop';
  signal: AbortSignal;
}) {
  const key = `browser-fixture-selection:${input.jobId}`;
  const registry = personalLearningPricingRegistry();
  const runtime = await reserveLearningProviderRuntimeConfiguration(
    key,
    'google',
    'LEARNING_LESSON',
    0,
    1,
  );
  if (!runtime.admission)
    throw new ApplicationError('CONFIGURATION_ERROR', 'browser model reservation unavailable');
  if (
    !runtime.modelCapabilities.includes('STRUCTURED_OUTPUT') ||
    !registry.some(
      (price) =>
        price.provider === 'google' &&
        price.model === runtime.model &&
        Date.parse(price.effectiveFrom) <= Date.now(),
    )
  ) {
    await settleProviderRuntimeAdmission(runtime.admission);
    throw new ApplicationError('CONFIGURATION_ERROR', 'browser model or pricing unavailable');
  }
  if (input.signal.aborted) {
    await settleProviderRuntimeAdmission(runtime.admission);
    throw new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'browser selection cancelled');
  }

  const start = Date.now();
  let result;
  try {
    const adapter = new GoogleLearningGenerationAdapter((url, init) =>
      fetch(url, {
        ...init,
        signal: init?.signal ? AbortSignal.any([init.signal, input.signal]) : input.signal,
      }),
    );
    result = await adapter.generate(
      {
        task: 'BROWSER_FIXTURE_SELECTION',
        provider: 'google',
        model: runtime.model,
        modelCapabilities: runtime.modelCapabilities,
        serializedPrompt: JSON.stringify({
          input: [
            {
              role: 'system',
              content:
                'Choose the clearest preview for the device. Return only one supplied candidate ID in the id field.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                device: input.device,
                candidates: { preview: 'Full-width preview', 'compact-preview': 'Compact preview' },
              }),
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              schema: {
                type: 'object',
                properties: { id: { type: 'string', enum: browserPreviewChoices } },
                required: ['id'],
              },
            },
          },
          max_output_tokens: 256,
        }),
      },
      (output) => browserPreviewResponseSchema.parse(output).id,
      { apiKey: runtime.apiKey },
    );
  } catch {
    // A request that did not return measurements may still have incurred a charge.
  }

  const measurement: AiCallMeasurement = result?.measurement ?? {
    provider: 'google',
    model: runtime.model,
    inputTokens: null,
    outputTokens: null,
    cachedInputTokens: null,
    latencyMs: Date.now() - start,
    success: false,
    errorCategory: 'UNKNOWN',
    validationResult: 'NOT_RUN',
    fallbackUsed: false,
    occurredAt: new Date(start).toISOString(),
  };
  const cost = estimateAiCallCost(measurement, registry);
  await recordAiUsage({
    workspaceId: input.workspaceId,
    actorUserId: input.actorId,
    bunshinId: null,
    taskType: 'BROWSER_FIXTURE_SELECTION',
    provider: 'google',
    model: measurement.model,
    promptVersion,
    status: measurement.success ? 'SUCCESS' : 'FAILED',
    inputTokens: measurement.inputTokens,
    outputTokens: measurement.outputTokens,
    latencyMs: measurement.latencyMs,
    estimatedCostUsdMicros: cost.totalCostUsdMicros,
    pricingVersion: cost.pricing?.pricingVersion ?? null,
    errorCode: measurement.errorCategory,
    idempotencyKey: key,
    occurredAt: new Date(measurement.occurredAt),
  });
  if (result?.requestFinished && cost.totalCostUsdMicros !== null) {
    await settleProviderRuntimeAdmission(runtime.admission);
  }
  if (!result?.value)
    throw new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'browser selection unavailable');
  return result.value;
}
