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

export interface TrendRuntimeConfiguration {
  provider: 'GROK' | 'EXA' | 'FIRECRAWL';
  apiKey: string;
  model: string | null;
  dailyBudgetUsdMicros: number;
  monthlyBudgetUsdMicros: number;
  requestCostUsdMicros: number;
}

export interface CreatomateRuntimeConfiguration {
  apiKey: string;
  requestCostUsdMicros: number;
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

export async function resolveTrendRuntimeConfiguration(input?: {
  repository?: AiProviderConfigurationRepository;
  crypto?: AiProviderSecretCryptoPort;
  preferredProviders?: Array<'GROK' | 'EXA' | 'FIRECRAWL'>;
}): Promise<TrendRuntimeConfiguration> {
  let repository = input?.repository;
  if (!repository) {
    const db = await import('@bunshin/database');
    repository = new db.PrismaAiProviderConfigurationRepository();
  }
  const crypto = input?.crypto ?? new AesGcmAiProviderSecretCrypto();
  const providers = input?.preferredProviders ?? ['GROK', 'EXA', 'FIRECRAWL'];
  for (const provider of providers) {
    try {
      const resolved = await new ResolveAiProviderRuntimeConfiguration(repository).execute({
        environment: currentAiProviderEnvironment(),
        provider,
      });
      return {
        provider,
        apiKey: crypto.decrypt(resolved.encryptedApiKey),
        model: resolved.configuration.model,
        dailyBudgetUsdMicros: resolved.configuration.dailyBudgetUsdMicros,
        monthlyBudgetUsdMicros: resolved.configuration.monthlyBudgetUsdMicros,
        requestCostUsdMicros: resolved.configuration.requestCostUsdMicros ?? 0,
      };
    } catch (error) {
      if (!isMissingActiveConfiguration(error)) throw error;
    }
  }
  throw new ApplicationError('CONFIGURATION_ERROR', 'active trend provider configuration required');
}

export async function resolveCreatomateRuntimeConfiguration(input?: {
  repository?: AiProviderConfigurationRepository;
  crypto?: AiProviderSecretCryptoPort;
}): Promise<CreatomateRuntimeConfiguration> {
  let repository = input?.repository;
  if (!repository) {
    const db = await import('@bunshin/database');
    repository = new db.PrismaAiProviderConfigurationRepository();
  }
  const resolved = await new ResolveAiProviderRuntimeConfiguration(repository).execute({
    environment: currentAiProviderEnvironment(),
    provider: 'CREATOMATE',
  });
  return {
    apiKey: (input?.crypto ?? new AesGcmAiProviderSecretCrypto()).decrypt(resolved.encryptedApiKey),
    requestCostUsdMicros: resolved.configuration.requestCostUsdMicros ?? 0,
  };
}
