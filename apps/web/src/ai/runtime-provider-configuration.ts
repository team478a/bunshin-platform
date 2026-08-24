import 'server-only';
import {
  ResolveAiProviderRuntimeConfiguration,
  type AiProviderConfigurationRepository,
  type AiProviderSecretCryptoPort,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import {
  AesGcmAiProviderSecretCrypto,
  currentAiProviderEnvironment,
} from './secure-provider-configuration';

export interface OpenAiRuntimeConfiguration {
  apiKey: string;
  model: string;
  source: 'ADMIN_CONFIGURATION' | 'LEGACY_ENVIRONMENT';
}

interface Dependencies {
  repository: AiProviderConfigurationRepository;
  crypto: AiProviderSecretCryptoPort;
  legacyApiKey?: string;
  legacyModel?: string;
}

function isMissingActiveConfiguration(error: unknown) {
  return (
    error instanceof ApplicationError &&
    error.code === 'CONFIGURATION_ERROR' &&
    error.message === 'active provider configuration required'
  );
}

export async function resolveOpenAiRuntimeConfiguration(
  dependencies?: Dependencies,
): Promise<OpenAiRuntimeConfiguration> {
  let repository: AiProviderConfigurationRepository;
  if (dependencies) repository = dependencies.repository;
  else {
    const db = await import('@bunshin/database');
    repository = new db.PrismaAiProviderConfigurationRepository();
  }
  const crypto = dependencies?.crypto ?? new AesGcmAiProviderSecretCrypto();
  try {
    const resolved = await new ResolveAiProviderRuntimeConfiguration(repository).execute({
      environment: currentAiProviderEnvironment(),
      provider: 'OPENAI',
    });
    if (!resolved.configuration.model)
      throw new ApplicationError('CONFIGURATION_ERROR', 'active OpenAI model is required');
    return {
      apiKey: crypto.decrypt(resolved.encryptedApiKey),
      model: resolved.configuration.model,
      source: 'ADMIN_CONFIGURATION',
    };
  } catch (error) {
    const legacyApiKey = dependencies?.legacyApiKey ?? process.env['OPENAI_API_KEY'];
    if (!isMissingActiveConfiguration(error) || !legacyApiKey) throw error;
    return {
      apiKey: legacyApiKey,
      model: dependencies?.legacyModel ?? process.env['OPENAI_MODEL'] ?? 'gpt-5.2',
      source: 'LEGACY_ENVIRONMENT',
    };
  }
}
