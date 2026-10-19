import 'server-only';
import {
  AI_MODEL_CAPABILITIES,
  ResolveAiProviderRuntimeConfiguration,
  ReserveAiProviderRuntimeCall,
  SettleAiProviderRuntimeCall,
  type AiModelCapability,
  type AiProviderConfigurationRepository,
  type AiProviderRuntimeAdmission,
  type AiProviderRuntimeAdmissionRepository,
  type AiProviderSecretCryptoPort,
  type LineConfigurationEnvironment,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { assertOpenAiTaskModel, type OpenAiCompatibilityTask } from './openai-task-compatibility';
import {
  AesGcmAiProviderSecretCrypto,
  currentAiProviderEnvironment,
} from './secure-provider-configuration';

export type LearningAiProvider = 'openai' | 'google';

export interface LearningAiRuntimeConfiguration {
  provider: LearningAiProvider;
  apiKey: string;
  model: string;
  modelCapabilities: readonly AiModelCapability[];
  requestCostUsdMicros: number;
  source: 'ADMIN_CONFIGURATION' | 'LEGACY_ENVIRONMENT';
  admission: AiProviderRuntimeAdmission | null;
}

type Dependencies = {
  repository?: AiProviderConfigurationRepository & Partial<AiProviderRuntimeAdmissionRepository>;
  crypto?: AiProviderSecretCryptoPort;
  environment?: LineConfigurationEnvironment;
  legacyApiKey?: string;
  legacyModel?: string;
  legacyRequestCostUsdMicros?: number;
};

function providerKey(provider: LearningAiProvider) {
  return provider === 'google' ? 'GOOGLE' : 'OPENAI';
}

function capabilities(value: readonly string[]) {
  return value.filter((item): item is AiModelCapability =>
    AI_MODEL_CAPABILITIES.includes(item as AiModelCapability),
  );
}

function legacyOpenAiRuntime(input: Dependencies, environment: LineConfigurationEnvironment) {
  const apiKey = input.legacyApiKey ?? process.env['OPENAI_API_KEY'];
  const model = input.legacyModel ?? process.env['OPENAI_MODEL'];
  const requestCostUsdMicros =
    input.legacyRequestCostUsdMicros ?? Number(process.env['OPENAI_REQUEST_COST_USD_MICROS']);
  if (
    !apiKey ||
    environment === 'PRODUCTION' ||
    !model ||
    !Number.isSafeInteger(requestCostUsdMicros) ||
    requestCostUsdMicros <= 0
  )
    throw new ApplicationError(
      'CONFIGURATION_ERROR',
      'active learning provider configuration required',
    );
  return {
    provider: 'openai' as const,
    apiKey,
    model,
    modelCapabilities: ['STRUCTURED_OUTPUT', 'IMAGE_INPUT'] as const,
    requestCostUsdMicros,
    source: 'LEGACY_ENVIRONMENT' as const,
    admission: null,
  };
}

export async function resolveLearningProviderRuntimeConfiguration(
  provider: LearningAiProvider,
  task: OpenAiCompatibilityTask,
  dependencies: Dependencies = {},
): Promise<LearningAiRuntimeConfiguration> {
  const environment = dependencies.environment ?? currentAiProviderEnvironment();
  if (provider === 'google' && environment === 'PRODUCTION')
    throw new ApplicationError('FORBIDDEN', 'Google learning provider is evaluation-only');
  const repository =
    dependencies.repository ??
    new (await import('@bunshin/database')).PrismaAiProviderConfigurationRepository();
  const crypto = dependencies.crypto ?? new AesGcmAiProviderSecretCrypto();
  try {
    const resolved = await new ResolveAiProviderRuntimeConfiguration(repository).execute({
      environment,
      provider: providerKey(provider),
    });
    const model = resolved.configuration.model;
    if (!model) throw new ApplicationError('CONFIGURATION_ERROR', 'active learning model required');
    if (provider === 'openai') assertOpenAiTaskModel(task, model);
    return {
      provider,
      apiKey: crypto.decrypt(resolved.encryptedApiKey),
      model,
      modelCapabilities: capabilities(resolved.configuration.modelCapabilities),
      requestCostUsdMicros: resolved.configuration.requestCostUsdMicros ?? 0,
      source: 'ADMIN_CONFIGURATION',
      admission: null,
    };
  } catch (error) {
    if (
      provider === 'openai' &&
      environment !== 'PRODUCTION' &&
      error instanceof ApplicationError &&
      error.code === 'CONFIGURATION_ERROR' &&
      error.message === 'active provider configuration required'
    )
      return legacyOpenAiRuntime(dependencies, environment);
    throw error;
  }
}

export async function reserveLearningProviderRuntimeConfiguration(
  operationKey: string,
  provider: LearningAiProvider,
  task: OpenAiCompatibilityTask,
  reservedCostUsdMicros: number,
  requestCount?: number,
  dependencies: Dependencies = {},
): Promise<LearningAiRuntimeConfiguration> {
  const environment = dependencies.environment ?? currentAiProviderEnvironment();
  if (provider === 'google' && environment === 'PRODUCTION')
    throw new ApplicationError('FORBIDDEN', 'Google learning provider is evaluation-only');
  const repository =
    dependencies.repository ??
    new (await import('@bunshin/database')).PrismaAiProviderConfigurationRepository();
  const crypto = dependencies.crypto ?? new AesGcmAiProviderSecretCrypto();
  if (!('reserveActiveForRuntime' in repository))
    throw new ApplicationError('CONFIGURATION_ERROR', 'provider reservation is unavailable');
  try {
    const reservation =
      reservedCostUsdMicros > 0 ? { reservedCostUsdMicros } : { requestCount: requestCount ?? 1 };
    const reserved = await new ReserveAiProviderRuntimeCall(
      repository as AiProviderRuntimeAdmissionRepository,
    ).execute({
      environment,
      provider: providerKey(provider),
      operationKey,
      ...reservation,
    });
    try {
      const model = reserved.configuration.model;
      if (!model)
        throw new ApplicationError('CONFIGURATION_ERROR', 'active learning model required');
      if (provider === 'openai') assertOpenAiTaskModel(task, model);
      return {
        provider,
        apiKey: crypto.decrypt(reserved.encryptedApiKey),
        model,
        modelCapabilities: capabilities(reserved.configuration.modelCapabilities),
        requestCostUsdMicros: reserved.configuration.requestCostUsdMicros ?? 0,
        source: 'ADMIN_CONFIGURATION',
        admission: reserved.admission,
      };
    } catch (error) {
      await new SettleAiProviderRuntimeCall(
        repository as AiProviderRuntimeAdmissionRepository,
      ).execute(reserved.admission);
      throw error;
    }
  } catch (error) {
    if (
      provider === 'openai' &&
      environment !== 'PRODUCTION' &&
      error instanceof ApplicationError &&
      error.code === 'CONFIGURATION_ERROR' &&
      error.message === 'active provider configuration required'
    )
      return legacyOpenAiRuntime(dependencies, environment);
    throw error;
  }
}
