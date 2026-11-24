import { ApplicationError } from '@bunshin/shared';

import { validateAdminReason } from './admin-configuration-validation';
import {
  LINE_CONFIGURATION_ENVIRONMENTS,
  type LineConfigurationEnvironment,
} from './configuration-environment';

export const AI_PROVIDER_KEYS = [
  'OPENAI',
  'GOOGLE',
  'GROK',
  'XAI',
  'EXA',
  'FIRECRAWL',
  'CREATOMATE',
  'FAL',
  'RUNWAY',
] as const;
export type AiProviderKey = (typeof AI_PROVIDER_KEYS)[number];
export const AI_PROVIDER_CAPABILITY_KEYS = [
  'GENERAL',
  'SOCIAL_IMAGE_GENERATION',
  'VIDEO_SCENE_GENERATION',
] as const;
export type AiProviderCapabilityKey = (typeof AI_PROVIDER_CAPABILITY_KEYS)[number];
export const AI_MODEL_CAPABILITIES = [
  'STRUCTURED_OUTPUT',
  'IMAGE_INPUT',
  'LONG_CONTEXT',
  'WEB_SEARCH',
  'AUDIO_INPUT',
  'TOOL_USE',
] as const;
export type AiModelCapability = (typeof AI_MODEL_CAPABILITIES)[number];
export type AiProviderConfigurationStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ERROR';
export interface AiProviderConfiguration {
  id: string;
  environment: LineConfigurationEnvironment;
  provider: AiProviderKey;
  capabilityKey: AiProviderCapabilityKey;
  version: number;
  status: AiProviderConfigurationStatus;
  apiKeyConfigured: boolean;
  apiKeyMask: string | null;
  model: string | null;
  modelCapabilities: readonly AiModelCapability[];
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
    capabilityKey: AiProviderCapabilityKey;
    reason: string;
    model: string | null;
    modelCapabilities?: readonly AiModelCapability[];
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
    capabilityKey?: AiProviderCapabilityKey;
    configurationId?: string;
    estimateUnknownCosts?: boolean;
    dailyFrom: Date;
    monthlyFrom: Date;
    now: Date;
  }): Promise<AiProviderRuntimeConfigurationSnapshot | null>;
}

export interface AiProviderRuntimeConfigurationSnapshot {
  configuration: AiProviderConfiguration;
  encryptedApiKey: string;
  dailySpentUsdMicros: number;
  monthlySpentUsdMicros: number;
  monthlyUnknownCostEvents: number;
  dailyUnknownCostEvents?: number;
}

export function assertAiProviderRuntimeConfiguration(
  input: {
    environment: LineConfigurationEnvironment;
    provider: AiProviderKey;
    capabilityKey?: AiProviderCapabilityKey;
    configurationId?: string;
    reservedCostUsdMicros?: number;
    requestCount?: number;
    estimateUnknownCosts?: boolean;
  },
  value: AiProviderRuntimeConfigurationSnapshot,
) {
  const { configuration } = value;
  if (configuration.environment !== input.environment || configuration.provider !== input.provider)
    throw new ApplicationError('CONFIGURATION_ERROR', 'provider configuration scope mismatch');
  if (input.capabilityKey && configuration.capabilityKey !== input.capabilityKey)
    throw new ApplicationError('CONFIGURATION_ERROR', 'provider capability scope mismatch');
  if (input.configurationId && configuration.id !== input.configurationId)
    throw new ApplicationError('CONFIGURATION_ERROR', 'provider configuration version mismatch');
  if (configuration.status !== 'ACTIVE' || configuration.globallyPaused)
    throw new ApplicationError('CONFIGURATION_ERROR', 'provider is paused');
  if (configuration.lastVerifiedAt === null || configuration.lastErrorCategory !== null)
    throw new ApplicationError('CONFIGURATION_ERROR', 'verified provider configuration required');
  if (value.monthlyUnknownCostEvents > 0 && !input.estimateUnknownCosts)
    throw new ApplicationError('CONFLICT', 'provider cost is unknown');
  const requestCostUsdMicros =
    input.reservedCostUsdMicros ??
    (configuration.requestCostUsdMicros ?? 0) * (input.requestCount ?? 1);
  if (!Number.isSafeInteger(requestCostUsdMicros) || requestCostUsdMicros <= 0)
    throw new ApplicationError('CONFIGURATION_ERROR', 'provider request cost is required');
  const estimatedCostPerEvent = input.estimateUnknownCosts ? configuration.requestCostUsdMicros : 0;
  const dailyEstimate =
    (value.dailyUnknownCostEvents ?? value.monthlyUnknownCostEvents) * (estimatedCostPerEvent ?? 0);
  const monthlyEstimate = value.monthlyUnknownCostEvents * (estimatedCostPerEvent ?? 0);
  if (
    value.dailySpentUsdMicros + dailyEstimate >
    configuration.dailyBudgetUsdMicros - requestCostUsdMicros
  )
    throw new ApplicationError('CONFLICT', 'daily provider budget reached');
  if (
    value.monthlySpentUsdMicros + monthlyEstimate >
    configuration.monthlyBudgetUsdMicros - requestCostUsdMicros
  )
    throw new ApplicationError('CONFLICT', 'monthly provider budget reached');
  return value;
}

export interface AiProviderRuntimeAdmission {
  id: string;
  environment: LineConfigurationEnvironment;
  provider: AiProviderKey;
  operationHash: string;
}

export interface AiProviderRuntimeAdmissionRepository {
  reserveActiveForRuntime(input: {
    environment: LineConfigurationEnvironment;
    provider: AiProviderKey;
    capabilityKey?: AiProviderCapabilityKey;
    configurationId?: string;
    operationKey: string;
    reservedCostUsdMicros?: number;
    requestCount?: number;
    estimateUnknownCosts?: boolean;
  }): Promise<
    (AiProviderRuntimeConfigurationSnapshot & { admission: AiProviderRuntimeAdmission }) | null
  >;
  settleRuntimeAdmission(input: AiProviderRuntimeAdmission): Promise<boolean>;
}

export interface AiProviderOpenAdmissionSummary {
  provider: AiProviderKey;
  openCount: number;
  recoverableCount: number;
  reservedCostUsdMicros: number;
  oldestAdmittedAt: Date;
}

export interface AiProviderRuntimeAdmissionAdminRepository {
  listOpenRuntimeAdmissions(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<{
    summaries: AiProviderOpenAdmissionSummary[];
    recoveryScanTruncated: boolean;
    canRecover: boolean;
  } | null>;
  recoverRecordedRuntimeAdmissions(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }): Promise<{ scanned: number; recovered: number; remainingOpen: number } | null>;
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
    capabilityKey?: AiProviderCapabilityKey;
    reason: string;
    model?: string | null;
    modelCapabilities?: readonly AiModelCapability[];
    dailyBudgetUsdMicros: number;
    monthlyBudgetUsdMicros: number;
    requestCostUsdMicros?: number;
    apiKey?: string | null;
  }) {
    if (!LINE_CONFIGURATION_ENVIRONMENTS.includes(input.environment))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid environment');
    if (!AI_PROVIDER_KEYS.includes(input.provider))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid provider');
    const capabilityKey =
      input.capabilityKey ??
      (input.provider === 'XAI'
        ? 'SOCIAL_IMAGE_GENERATION'
        : input.provider === 'FAL' || input.provider === 'RUNWAY'
          ? 'VIDEO_SCENE_GENERATION'
          : 'GENERAL');
    if (!AI_PROVIDER_CAPABILITY_KEYS.includes(capabilityKey))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid provider capability');
    const capabilityAllowed =
      (input.provider === 'OPENAI' &&
        (capabilityKey === 'GENERAL' || capabilityKey === 'SOCIAL_IMAGE_GENERATION')) ||
      (input.provider === 'XAI' &&
        (capabilityKey === 'SOCIAL_IMAGE_GENERATION' ||
          capabilityKey === 'VIDEO_SCENE_GENERATION')) ||
      ((input.provider === 'FAL' || input.provider === 'RUNWAY') &&
        capabilityKey === 'VIDEO_SCENE_GENERATION') ||
      (!['OPENAI', 'XAI', 'FAL', 'RUNWAY'].includes(input.provider) && capabilityKey === 'GENERAL');
    if (!capabilityAllowed)
      throw new ApplicationError('VALIDATION_ERROR', 'provider capability is not supported');
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
    const model = input.model?.trim() || null;
    if (
      ['OPENAI', 'GOOGLE', 'GROK', 'XAI', 'FAL', 'RUNWAY'].includes(input.provider) &&
      model === null
    )
      throw new ApplicationError('VALIDATION_ERROR', 'AI model is required');
    if (
      !['OPENAI', 'GOOGLE', 'GROK', 'XAI', 'FAL', 'RUNWAY'].includes(input.provider) &&
      model !== null
    )
      throw new ApplicationError('VALIDATION_ERROR', 'model is not supported for this provider');
    const modelCapabilities = input.modelCapabilities ?? [];
    if (
      modelCapabilities.some((capability) => !AI_MODEL_CAPABILITIES.includes(capability)) ||
      new Set(modelCapabilities).size !== modelCapabilities.length
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid model capabilities');
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
      capabilityKey,
      reason,
      model,
      modelCapabilities,
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
    if (input.environment === 'PRODUCTION') {
      const current = await this.repository.listForAdmin({
        actorUserId: input.actorUserId,
        environment: input.environment,
      });
      if (current?.some((item) => item.id === input.configurationId && item.provider === 'GOOGLE'))
        throw new ApplicationError('FORBIDDEN', 'Google learning provider is evaluation-only');
    }
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
    capabilityKey?: AiProviderCapabilityKey;
    configurationId?: string;
    estimateUnknownCosts?: boolean;
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
    return assertAiProviderRuntimeConfiguration(input, value);
  }
}

export class ReserveAiProviderRuntimeCall {
  constructor(private readonly repository: AiProviderRuntimeAdmissionRepository) {}

  async execute(input: {
    environment: LineConfigurationEnvironment;
    provider: AiProviderKey;
    capabilityKey?: AiProviderCapabilityKey;
    configurationId?: string;
    operationKey: string;
    reservedCostUsdMicros?: number;
    requestCount?: number;
    estimateUnknownCosts?: boolean;
  }) {
    if (!input.operationKey.trim() || input.operationKey.length > 200)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid provider operation key');
    if (
      input.reservedCostUsdMicros !== undefined &&
      (!Number.isSafeInteger(input.reservedCostUsdMicros) || input.reservedCostUsdMicros <= 0)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid provider reserved cost');
    if (
      input.requestCount !== undefined &&
      (!Number.isSafeInteger(input.requestCount) ||
        input.requestCount < 1 ||
        input.requestCount > 100)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid provider request count');
    if (input.reservedCostUsdMicros !== undefined && input.requestCount !== undefined)
      throw new ApplicationError('VALIDATION_ERROR', 'ambiguous provider reservation');
    const value = await this.repository.reserveActiveForRuntime(input);
    if (value === null)
      throw new ApplicationError('CONFIGURATION_ERROR', 'active provider configuration required');
    return value;
  }
}

export class SettleAiProviderRuntimeCall {
  constructor(private readonly repository: AiProviderRuntimeAdmissionRepository) {}

  async execute(input: AiProviderRuntimeAdmission) {
    const settled = await this.repository.settleRuntimeAdmission(input);
    if (!settled) throw new ApplicationError('CONFLICT', 'provider call admission is not open');
  }
}

export class ListOpenAiProviderRuntimeAdmissions {
  constructor(private readonly repository: AiProviderRuntimeAdmissionAdminRepository) {}

  async execute(actorUserId: string, environment: LineConfigurationEnvironment) {
    const value = await this.repository.listOpenRuntimeAdmissions({ actorUserId, environment });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return value;
  }
}

export class RecoverRecordedAiProviderRuntimeAdmissions {
  constructor(private readonly repository: AiProviderRuntimeAdmissionAdminRepository) {}

  async execute(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }) {
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
    const value = await this.repository.recoverRecordedRuntimeAdmissions({ ...input, reason });
    if (value === null) throw new ApplicationError('FORBIDDEN', 'super admin required');
    return value;
  }
}
