import { ApplicationError } from '@bunshin/shared';

import { validateAdminReason } from './admin-configuration-validation';
import {
  LINE_CONFIGURATION_ENVIRONMENTS,
  type LineConfigurationEnvironment,
} from './configuration-environment';

export const AI_PROVIDER_KEYS = [
  'OPENAI',
  'GROK',
  'EXA',
  'FIRECRAWL',
  'CREATOMATE',
  'FAL',
  'RUNWAY',
] as const;
export type AiProviderKey = (typeof AI_PROVIDER_KEYS)[number];
export type AiProviderConfigurationStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ERROR';
export interface AiProviderConfiguration {
  id: string;
  environment: LineConfigurationEnvironment;
  provider: AiProviderKey;
  version: number;
  status: AiProviderConfigurationStatus;
  apiKeyConfigured: boolean;
  apiKeyMask: string | null;
  model: string | null;
  dailyBudgetUsdMicros: number;
  monthlyBudgetUsdMicros: number;
  requestCostUsdMicros?: number;
  globallyPaused: boolean;
  keyVersion: number;
  lastVerifiedAt: Date | null;
  lastErrorCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface EncryptedAiProviderApiKey {
  encryptedValue: string;
  mask: string;
  keyVersion: number;
}
export interface AiProviderSecretCryptoPort {
  encrypt(value: string): EncryptedAiProviderApiKey;
  decrypt(value: string): string;
}
export interface AiProviderConnectionTestPort {
  validate(input: { provider: AiProviderKey; apiKey: string; model: string | null }): Promise<{
    success: boolean;
    errorCategory: string | null;
  }>;
}
export interface AiProviderConfigurationRepository {
  listForAdmin(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<AiProviderConfiguration[] | null>;
  createVersion(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    provider: AiProviderKey;
    reason: string;
    model: string | null;
    dailyBudgetUsdMicros: number;
    monthlyBudgetUsdMicros: number;
    requestCostUsdMicros?: number;
    apiKey: EncryptedAiProviderApiKey | null;
  }): Promise<AiProviderConfiguration | null>;
  getForConnectionTest(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<{ configuration: AiProviderConfiguration; encryptedApiKey: string } | null>;
  recordConnectionTest(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    success: boolean;
    errorCategory: string | null;
  }): Promise<void>;
  activate(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }): Promise<AiProviderConfiguration | null>;
  pause(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }): Promise<AiProviderConfiguration | null>;
  getActiveForRuntime(input: {
    environment: LineConfigurationEnvironment;
    provider: AiProviderKey;
    dailyFrom: Date;
    monthlyFrom: Date;
    now: Date;
  }): Promise<{
    configuration: AiProviderConfiguration;
    encryptedApiKey: string;
    dailySpentUsdMicros: number;
    monthlySpentUsdMicros: number;
  } | null>;
}

export class ListAiProviderConfigurations {
  constructor(private readonly repository: AiProviderConfigurationRepository) {}
  async execute(actorUserId: string, environment: LineConfigurationEnvironment) {
    const values = await this.repository.listForAdmin({ actorUserId, environment });
    if (values === null) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return values;
  }
}

export class CreateAiProviderConfigurationVersion {
  constructor(
    private readonly repository: AiProviderConfigurationRepository,
    private readonly crypto: AiProviderSecretCryptoPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    provider: AiProviderKey;
    reason: string;
    model?: string | null;
    dailyBudgetUsdMicros: number;
    monthlyBudgetUsdMicros: number;
    requestCostUsdMicros?: number;
    apiKey?: string | null;
  }) {
    if (!LINE_CONFIGURATION_ENVIRONMENTS.includes(input.environment))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid environment');
    if (!AI_PROVIDER_KEYS.includes(input.provider))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid provider');
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
    const model = input.model?.trim() || null;
    if (['OPENAI', 'GROK', 'FAL', 'RUNWAY'].includes(input.provider) && model === null)
      throw new ApplicationError('VALIDATION_ERROR', 'AI model is required');
    if (!['OPENAI', 'GROK', 'FAL', 'RUNWAY'].includes(input.provider) && model !== null)
      throw new ApplicationError('VALIDATION_ERROR', 'model is not supported for this provider');
    if (
      !Number.isSafeInteger(input.dailyBudgetUsdMicros) ||
      !Number.isSafeInteger(input.monthlyBudgetUsdMicros) ||
      input.dailyBudgetUsdMicros < 0 ||
      input.monthlyBudgetUsdMicros < input.dailyBudgetUsdMicros ||
      !Number.isSafeInteger(input.requestCostUsdMicros ?? 0) ||
      (input.requestCostUsdMicros ?? 0) < 0
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid budget');
    const rawApiKey = input.apiKey?.trim() || null;
    const value = await this.repository.createVersion({
      actorUserId: input.actorUserId,
      environment: input.environment,
      provider: input.provider,
      reason,
      model,
      dailyBudgetUsdMicros: input.dailyBudgetUsdMicros,
      monthlyBudgetUsdMicros: input.monthlyBudgetUsdMicros,
      requestCostUsdMicros: input.requestCostUsdMicros ?? 0,
      apiKey: rawApiKey === null ? null : this.crypto.encrypt(rawApiKey),
    });
    if (value === null) throw new ApplicationError('FORBIDDEN', 'super admin required');
    return value;
  }
}

export class TestAiProviderConfigurationConnection {
  constructor(
    private readonly repository: AiProviderConfigurationRepository,
    private readonly crypto: AiProviderSecretCryptoPort,
    private readonly provider: AiProviderConnectionTestPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
  }) {
    const stored = await this.repository.getForConnectionTest(input);
    if (stored === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    let result: { success: boolean; errorCategory: string | null };
    try {
      result = await this.provider.validate({
        provider: stored.configuration.provider,
        apiKey: this.crypto.decrypt(stored.encryptedApiKey),
        model: stored.configuration.model,
      });
    } catch {
      result = { success: false, errorCategory: 'PROVIDER_UNAVAILABLE' };
    }
    await this.repository.recordConnectionTest({ ...input, ...result });
    return result;
  }
}

export class ActivateAiProviderConfiguration {
  constructor(private readonly repository: AiProviderConfigurationRepository) {}
  async execute(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }) {
    const value = await this.repository.activate({
      ...input,
      reason: validateAdminReason(input.reason),
    });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    return value;
  }
}

export class PauseAiProviderConfiguration {
  constructor(private readonly repository: AiProviderConfigurationRepository) {}
  async execute(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }) {
    const value = await this.repository.pause({
      ...input,
      reason: validateAdminReason(input.reason),
    });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    return value;
  }
}

export class ResolveAiProviderRuntimeConfiguration {
  constructor(private readonly repository: AiProviderConfigurationRepository) {}
  async execute(input: {
    environment: LineConfigurationEnvironment;
    provider: AiProviderKey;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const dailyFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthlyFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const value = await this.repository.getActiveForRuntime({
      ...input,
      now,
      dailyFrom,
      monthlyFrom,
    });
    if (value === null)
      throw new ApplicationError('CONFIGURATION_ERROR', 'active provider configuration required');
    const { configuration } = value;
    if (
      configuration.environment !== input.environment ||
      configuration.provider !== input.provider
    )
      throw new ApplicationError('CONFIGURATION_ERROR', 'provider configuration scope mismatch');
    if (configuration.status !== 'ACTIVE' || configuration.globallyPaused)
      throw new ApplicationError('CONFIGURATION_ERROR', 'provider is paused');
    if (configuration.lastVerifiedAt === null || configuration.lastErrorCategory !== null)
      throw new ApplicationError('CONFIGURATION_ERROR', 'verified provider configuration required');
    if (value.dailySpentUsdMicros >= configuration.dailyBudgetUsdMicros)
      throw new ApplicationError('CONFLICT', 'daily provider budget reached');
    if (value.monthlySpentUsdMicros >= configuration.monthlyBudgetUsdMicros)
      throw new ApplicationError('CONFLICT', 'monthly provider budget reached');
    return value;
  }
}
