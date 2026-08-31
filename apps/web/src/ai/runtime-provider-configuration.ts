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
  requestCostUsdMicros: number;
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

export interface VideoAiRuntimeConfiguration {
  provider: 'FAL' | 'RUNWAY';
  apiKey: string;
  model: string;
  dailyBudgetUsdMicros: number;
  monthlyBudgetUsdMicros: number;
  estimatedCostUsdMicrosPerSecond: number;
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
      requestCostUsdMicros: resolved.configuration.requestCostUsdMicros ?? 0,
      source: 'ADMIN_CONFIGURATION',
    };
  } catch (error) {
    const legacyApiKey = dependencies?.legacyApiKey ?? process.env['OPENAI_API_KEY'];
    if (!isMissingActiveConfiguration(error) || !legacyApiKey) throw error;
    return {
      apiKey: legacyApiKey,
      model: dependencies?.legacyModel ?? process.env['OPENAI_MODEL'] ?? 'gpt-5.2',
      requestCostUsdMicros: 0,
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

/**
 * Resolves only an active, verified video provider configuration for the current runtime
 * environment. Video providers intentionally have no legacy environment-variable fallback:
 * every paid generation must remain visible and pausable in the admin console.
 */
export async function resolveVideoAiRuntimeConfiguration(input: {
  provider: 'FAL' | 'RUNWAY';
  repository?: AiProviderConfigurationRepository;
  crypto?: AiProviderSecretCryptoPort;
}): Promise<VideoAiRuntimeConfiguration> {
  let repository = input.repository;
  if (!repository) {
    const db = await import('@bunshin/database');
    repository = new db.PrismaAiProviderConfigurationRepository();
  }
  const resolved = await new ResolveAiProviderRuntimeConfiguration(repository).execute({
    environment: currentAiProviderEnvironment(),
    provider: input.provider,
  });
  const model = resolved.configuration.model?.trim();
  if (!model)
    throw new ApplicationError('CONFIGURATION_ERROR', 'active video provider model is required');
  return {
    provider: input.provider,
    apiKey: (input.crypto ?? new AesGcmAiProviderSecretCrypto()).decrypt(resolved.encryptedApiKey),
    model,
    dailyBudgetUsdMicros: resolved.configuration.dailyBudgetUsdMicros,
    monthlyBudgetUsdMicros: resolved.configuration.monthlyBudgetUsdMicros,
    estimatedCostUsdMicrosPerSecond: resolved.configuration.requestCostUsdMicros ?? 0,
  };
}
