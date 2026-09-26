import { ApplicationError } from '@bunshin/shared';

import { validateAdminReason } from './admin-configuration-validation';
import {
  LINE_CONFIGURATION_ENVIRONMENTS,
  type LineConfigurationEnvironment,
} from './configuration-environment';
export type LineConfigurationStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ERROR';

export interface LineChannelConfiguration {
  id: string;
  environment: LineConfigurationEnvironment;
  version: number;
  status: LineConfigurationStatus;
  loginChannelId: string;
  loginSecretMask: string;
  messagingChannelId: string;
  messagingSecretMask: string;
  accessTokenMask: string;
  liffId: string | null;
  defaultNotificationTime: string;
  defaultTimezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  globallyPaused: boolean;
  quotaWarningPercent: number;
  quotaLowPriorityStop: number;
  keyVersion: number;
  lastVerifiedAt: Date | null;
  lastErrorCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface EncryptedLineSecrets {
  loginSecret: string;
  messagingSecret: string;
  accessToken: string;
  loginSecretMask: string;
  messagingSecretMask: string;
  accessTokenMask: string;
  keyVersion: number;
}
export interface LineConfigurationRepository {
  listForAdmin(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<LineChannelConfiguration[] | null>;
  createVersion(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    loginChannelId: string;
    messagingChannelId: string;
    liffId: string | null;
    defaultNotificationTime: string;
    defaultTimezone: string;
    quietHoursStart: string;
    quietHoursEnd: string;
    globallyPaused: boolean;
    quotaWarningPercent: number;
    quotaLowPriorityStop: number;
    secrets: EncryptedLineSecrets;
  }): Promise<LineChannelConfiguration | null>;
  activate(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }): Promise<LineChannelConfiguration | null>;
  getForConnectionTest(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<{
    configuration: LineChannelConfiguration;
    loginSecret: string;
    messagingSecret: string;
    accessToken: string;
  } | null>;
  recordConnectionTest(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    success: boolean;
    errorCategory: string | null;
  }): Promise<void>;
}
export interface LineSecretCryptoPort {
  encryptSecrets(input: {
    loginSecret: string;
    messagingSecret: string;
    accessToken: string;
  }): EncryptedLineSecrets;
  decrypt(value: string): string;
}
export interface LineConnectionTestPort {
  validate(input: {
    loginChannelId: string;
    loginChannelSecret: string;
    messagingChannelId: string;
    messagingChannelSecret: string;
    channelAccessToken: string;
    callbackUrl: string;
  }): Promise<{ success: boolean; errorCategory: string | null; botDisplayName: string | null }>;
}
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
export class ListLineConfigurations {
  constructor(private readonly repository: LineConfigurationRepository) {}
  async execute(actorUserId: string, environment: LineConfigurationEnvironment) {
    const values = await this.repository.listForAdmin({ actorUserId, environment });
    if (values === null) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return values;
  }
}
export class CreateLineConfigurationVersion {
  constructor(
    private readonly repository: LineConfigurationRepository,
    private readonly crypto: LineSecretCryptoPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    loginChannelId: string;
    loginChannelSecret: string;
    messagingChannelId: string;
    messagingChannelSecret: string;
    channelAccessToken: string;
    liffId?: string | null;
    defaultNotificationTime: string;
    defaultTimezone: string;
    quietHoursStart: string;
    quietHoursEnd: string;
    globallyPaused: boolean;
    quotaWarningPercent: number;
    quotaLowPriorityStop: number;
  }) {
    if (!LINE_CONFIGURATION_ENVIRONMENTS.includes(input.environment))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid environment');
    const reason = validateAdminReason(input.reason);
    if (
      ![input.defaultNotificationTime, input.quietHoursStart, input.quietHoursEnd].every((v) =>
        timePattern.test(v),
      )
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid time');
    if (
      !input.loginChannelId.trim() ||
      !input.messagingChannelId.trim() ||
      input.defaultTimezone.trim().length < 1
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid configuration');
    if (
      input.quotaWarningPercent < 1 ||
      input.quotaLowPriorityStop > 100 ||
      input.quotaWarningPercent >= input.quotaLowPriorityStop
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid quota thresholds');
    const secrets = this.crypto.encryptSecrets({
      loginSecret: input.loginChannelSecret,
      messagingSecret: input.messagingChannelSecret,
      accessToken: input.channelAccessToken,
    });
    const value = await this.repository.createVersion({
      actorUserId: input.actorUserId,
      environment: input.environment,
      reason,
      loginChannelId: input.loginChannelId.trim(),
      messagingChannelId: input.messagingChannelId.trim(),
      liffId: input.liffId?.trim() || null,
      defaultNotificationTime: input.defaultNotificationTime,
      defaultTimezone: input.defaultTimezone.trim(),
      quietHoursStart: input.quietHoursStart,
      quietHoursEnd: input.quietHoursEnd,
      globallyPaused: input.globallyPaused,
      quotaWarningPercent: input.quotaWarningPercent,
      quotaLowPriorityStop: input.quotaLowPriorityStop,
      secrets,
    });
    if (value === null) throw new ApplicationError('FORBIDDEN', 'super admin required');
    return value;
  }
}
export class ActivateLineConfiguration {
  constructor(private readonly repository: LineConfigurationRepository) {}
  async execute(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }) {
    const reason = validateAdminReason(input.reason);
    const value = await this.repository.activate({ ...input, reason });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    return value;
  }
}
export class TestLineConfigurationConnection {
  constructor(
    private readonly repository: LineConfigurationRepository,
    private readonly crypto: LineSecretCryptoPort,
    private readonly provider: LineConnectionTestPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    callbackUrl: string;
  }) {
    const stored = await this.repository.getForConnectionTest(input);
    if (stored === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    let result: { success: boolean; errorCategory: string | null; botDisplayName: string | null };
    try {
      result = await this.provider.validate({
        loginChannelId: stored.configuration.loginChannelId,
        loginChannelSecret: this.crypto.decrypt(stored.loginSecret),
        messagingChannelId: stored.configuration.messagingChannelId,
        messagingChannelSecret: this.crypto.decrypt(stored.messagingSecret),
        channelAccessToken: this.crypto.decrypt(stored.accessToken),
        callbackUrl: input.callbackUrl,
      });
    } catch {
      result = { success: false, errorCategory: 'PROVIDER_UNAVAILABLE', botDisplayName: null };
    }
    await this.repository.recordConnectionTest({
      actorUserId: input.actorUserId,
      configurationId: input.configurationId,
      environment: input.environment,
      success: result.success,
      errorCategory: result.errorCategory,
    });
    return result;
  }
}
