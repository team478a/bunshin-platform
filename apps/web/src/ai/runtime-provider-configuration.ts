import 'server-only';
import {
  ResolveAiProviderRuntimeConfiguration,
  ReserveAiProviderRuntimeCall,
  SettleAiProviderRuntimeCall,
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

export interface OpenAiRuntimeConfiguration {
  apiKey: string;
  model: string;
  requestCostUsdMicros: number;
  source: 'ADMIN_CONFIGURATION' | 'LEGACY_ENVIRONMENT';
}

export interface AdmittedOpenAiRuntimeConfiguration extends OpenAiRuntimeConfiguration {
  admission: AiProviderRuntimeAdmission | null;
}

export interface TrendRuntimeConfiguration {
  provider: 'GROK' | 'EXA' | 'FIRECRAWL';
  apiKey: string;
  model: string | null;
  dailyBudgetUsdMicros: number;
  monthlyBudgetUsdMicros: number;
  requestCostUsdMicros: number;
}

export interface AdmittedTrendRuntimeConfiguration extends TrendRuntimeConfiguration {
  admission: AiProviderRuntimeAdmission;
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
  legacyRequestCostUsdMicros?: number;
  environment?: LineConfigurationEnvironment;
}

function isMissingActiveConfiguration(error: unknown) {
  return (
    error instanceof ApplicationError &&
    error.code === 'CONFIGURATION_ERROR' &&
    error.message === 'active provider configuration required'
  );
}

function resolveLegacyOpenAiRuntimeConfiguration(
  input: {
    environment: LineConfigurationEnvironment;
    legacyApiKey?: string | undefined;
    legacyModel?: string | undefined;
    legacyRequestCostUsdMicros?: number | undefined;
  },
  task?: OpenAiCompatibilityTask,
): OpenAiRuntimeConfiguration {
  const legacyApiKey = input.legacyApiKey ?? process.env['OPENAI_API_KEY'];
  if (!legacyApiKey || input.environment === 'PRODUCTION')
    throw new ApplicationError('CONFIGURATION_ERROR', 'active provider configuration required');
  const model = input.legacyModel ?? process.env['OPENAI_MODEL'] ?? 'gpt-5.2';
  if (task) assertOpenAiTaskModel(task, model);
  const requestCostUsdMicros =
    input.legacyRequestCostUsdMicros ?? Number(process.env['OPENAI_REQUEST_COST_USD_MICROS']);
  if (!Number.isSafeInteger(requestCostUsdMicros) || requestCostUsdMicros <= 0)
    throw new ApplicationError('CONFIGURATION_ERROR', 'legacy OpenAI request cost is required');
  return {
    apiKey: legacyApiKey,
    model,
    requestCostUsdMicros,
    source: 'LEGACY_ENVIRONMENT',
  };
}

export async function resolveOpenAiRuntimeConfiguration(
  dependencies?: Dependencies,
  task?: OpenAiCompatibilityTask,
): Promise<OpenAiRuntimeConfiguration> {
  const environment = dependencies?.environment ?? currentAiProviderEnvironment();
  let repository: AiProviderConfigurationRepository;
  if (dependencies) repository = dependencies.repository;
  else {
    const db = await import('@bunshin/database');
    repository = new db.PrismaAiProviderConfigurationRepository();
  }
  const crypto = dependencies?.crypto ?? new AesGcmAiProviderSecretCrypto();
  try {
    const resolved = await new ResolveAiProviderRuntimeConfiguration(repository).execute({
      environment,
      provider: 'OPENAI',
    });
    if (!resolved.configuration.model)
      throw new ApplicationError('CONFIGURATION_ERROR', 'active OpenAI model is required');
    if (task) assertOpenAiTaskModel(task, resolved.configuration.model);
    return {
      apiKey: crypto.decrypt(resolved.encryptedApiKey),
      model: resolved.configuration.model,
      requestCostUsdMicros: resolved.configuration.requestCostUsdMicros ?? 0,
      source: 'ADMIN_CONFIGURATION',
    };
  } catch (error) {
    if (!isMissingActiveConfiguration(error)) throw error;
    return resolveLegacyOpenAiRuntimeConfiguration(
      {
        environment,
        legacyApiKey: dependencies?.legacyApiKey,
        legacyModel: dependencies?.legacyModel,
        legacyRequestCostUsdMicros: dependencies?.legacyRequestCostUsdMicros,
      },
      task,
    );
  }
}

export async function reserveOpenAiRuntimeConfiguration(
  operationKey: string,
  dependencies?: Omit<Dependencies, 'repository'> & {
    repository: AiProviderConfigurationRepository & AiProviderRuntimeAdmissionRepository;
  },
  task?: OpenAiCompatibilityTask,
): Promise<AdmittedOpenAiRuntimeConfiguration> {
  const environment = dependencies?.environment ?? currentAiProviderEnvironment();
  let repository = dependencies?.repository;
  if (!repository) {
    const db = await import('@bunshin/database');
    repository = new db.PrismaAiProviderConfigurationRepository();
  }
  const crypto = dependencies?.crypto ?? new AesGcmAiProviderSecretCrypto();
  try {
    const reserved = await new ReserveAiProviderRuntimeCall(repository).execute({
      environment,
      provider: 'OPENAI',
      operationKey,
    });
    try {
      if (!reserved.configuration.model)
        throw new ApplicationError('CONFIGURATION_ERROR', 'active OpenAI model is required');
      if (task) assertOpenAiTaskModel(task, reserved.configuration.model);
      return {
        apiKey: crypto.decrypt(reserved.encryptedApiKey),
        model: reserved.configuration.model,
        requestCostUsdMicros: reserved.configuration.requestCostUsdMicros ?? 0,
        source: 'ADMIN_CONFIGURATION',
        admission: reserved.admission,
      };
    } catch (error) {
      await new SettleAiProviderRuntimeCall(repository).execute(reserved.admission);
      throw error;
    }
  } catch (error) {
    if (!isMissingActiveConfiguration(error)) throw error;
    const legacy = resolveLegacyOpenAiRuntimeConfiguration(
      {
        environment,
        legacyApiKey: dependencies?.legacyApiKey,
        legacyModel: dependencies?.legacyModel,
        legacyRequestCostUsdMicros: dependencies?.legacyRequestCostUsdMicros,
      },
      task,
    );
    return { ...legacy, admission: null };
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

export async function reserveTrendRuntimeConfiguration(
  operationKey: string,
  input?: {
    repository?: AiProviderConfigurationRepository & AiProviderRuntimeAdmissionRepository;
    crypto?: AiProviderSecretCryptoPort;
    preferredProviders?: Array<'GROK' | 'EXA' | 'FIRECRAWL'>;
  },
): Promise<AdmittedTrendRuntimeConfiguration> {
  let repository = input?.repository;
  if (!repository) {
    const db = await import('@bunshin/database');
    repository = new db.PrismaAiProviderConfigurationRepository();
  }
  const crypto = input?.crypto ?? new AesGcmAiProviderSecretCrypto();
  const providers = input?.preferredProviders ?? ['GROK', 'EXA', 'FIRECRAWL'];
  for (const provider of providers) {
    try {
      const reserved = await new ReserveAiProviderRuntimeCall(repository).execute({
        environment: currentAiProviderEnvironment(),
        provider,
        operationKey,
      });
      let apiKey: string;
      try {
        apiKey = crypto.decrypt(reserved.encryptedApiKey);
      } catch (error) {
        await new SettleAiProviderRuntimeCall(repository).execute(reserved.admission);
        throw error;
      }
      return {
        provider,
        apiKey,
        model: reserved.configuration.model,
        dailyBudgetUsdMicros: reserved.configuration.dailyBudgetUsdMicros,
        monthlyBudgetUsdMicros: reserved.configuration.monthlyBudgetUsdMicros,
        requestCostUsdMicros: reserved.configuration.requestCostUsdMicros ?? 0,
        admission: reserved.admission,
      };
    } catch (error) {
      if (!isMissingActiveConfiguration(error)) throw error;
    }
  }
  throw new ApplicationError('CONFIGURATION_ERROR', 'active trend provider configuration required');
}

export async function settleProviderRuntimeAdmission(
  admission: AiProviderRuntimeAdmission,
  repository?: AiProviderRuntimeAdmissionRepository,
) {
  if (!repository) {
    const db = await import('@bunshin/database');
    repository = new db.PrismaAiProviderConfigurationRepository();
  }
  await new SettleAiProviderRuntimeCall(repository).execute(admission);
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
