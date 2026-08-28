import { ApplicationError } from '@bunshin/shared';
import type {
  EncryptedLineSecrets,
  LineConfigurationEnvironment,
  LineConfigurationStatus,
  LineConnectionTestPort,
  LineSecretCryptoPort,
} from './index';

export type GroupLineMode = 'SHARED' | 'DEDICATED' | 'DISABLED';

export interface GroupLineChannelConfiguration {
  id: string;
  workspaceId: string;
  groupId: string;
  environment: LineConfigurationEnvironment;
  version: number;
  status: LineConfigurationStatus;
  webhookRoutingKey: string;
  loginChannelId: string;
  loginSecretMask: string;
  messagingChannelId: string;
  messagingSecretMask: string;
  accessTokenMask: string;
  liffId: string | null;
  globallyPaused: boolean;
  quotaWarningPercent: number;
  quotaLowPriorityStop: number;
  keyVersion: number;
  lastVerifiedAt: Date | null;
  lastErrorCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupLineConfigurationRepository {
  list(input: {
    actorUserId: string;
    workspaceId: string;
    groupId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<{
    mode: GroupLineMode;
    pilotEnabled: boolean;
    configurations: GroupLineChannelConfiguration[];
  } | null>;
  createVersion(input: {
    actorUserId: string;
    workspaceId: string;
    groupId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    loginChannelId: string;
    messagingChannelId: string;
    liffId: string | null;
    quotaWarningPercent: number;
    quotaLowPriorityStop: number;
    secrets: EncryptedLineSecrets;
  }): Promise<GroupLineChannelConfiguration | null>;
  getForTest(input: {
    actorUserId: string;
    workspaceId: string;
    groupId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<{
    configuration: GroupLineChannelConfiguration;
    loginSecret: string;
    messagingSecret: string;
    accessToken: string;
  } | null>;
  recordTest(input: {
    actorUserId: string;
    workspaceId: string;
    groupId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    success: boolean;
    errorCategory: string | null;
  }): Promise<void>;
  activate(input: {
    actorUserId: string;
    workspaceId: string;
    groupId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }): Promise<GroupLineChannelConfiguration | null>;
  setPolicy(input: {
    actorUserId: string;
    workspaceId: string;
    groupId: string;
    environment: LineConfigurationEnvironment;
    mode: GroupLineMode;
    pilotEnabled: boolean;
    reason: string;
  }): Promise<{ mode: GroupLineMode; pilotEnabled: boolean } | null>;
}

export class ListGroupLineConfigurations {
  constructor(private readonly repository: GroupLineConfigurationRepository) {}
  async execute(input: Parameters<GroupLineConfigurationRepository['list']>[0]) {
    const value = await this.repository.list(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return value;
  }
}

export class CreateGroupLineConfigurationVersion {
  constructor(
    private readonly repository: GroupLineConfigurationRepository,
    private readonly crypto: LineSecretCryptoPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    workspaceId: string;
    groupId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    loginChannelId: string;
    loginChannelSecret: string;
    messagingChannelId: string;
    messagingChannelSecret: string;
    channelAccessToken: string;
    liffId?: string | null;
    quotaWarningPercent: number;
    quotaLowPriorityStop: number;
  }) {
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
    if (!input.loginChannelId.trim() || !input.messagingChannelId.trim())
      throw new ApplicationError('VALIDATION_ERROR', 'invalid configuration');
    if (
      input.quotaWarningPercent < 1 ||
      input.quotaLowPriorityStop > 100 ||
      input.quotaWarningPercent >= input.quotaLowPriorityStop
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid quota thresholds');
    const value = await this.repository.createVersion({
      actorUserId: input.actorUserId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      environment: input.environment,
      reason,
      loginChannelId: input.loginChannelId.trim(),
      messagingChannelId: input.messagingChannelId.trim(),
      liffId: input.liffId?.trim() || null,
      quotaWarningPercent: input.quotaWarningPercent,
      quotaLowPriorityStop: input.quotaLowPriorityStop,
      secrets: this.crypto.encryptSecrets({
        loginSecret: input.loginChannelSecret,
        messagingSecret: input.messagingChannelSecret,
        accessToken: input.channelAccessToken,
      }),
    });
    if (!value) throw new ApplicationError('FORBIDDEN', 'super admin required');
    return value;
  }
}

export class TestGroupLineConfigurationConnection {
  constructor(
    private readonly repository: GroupLineConfigurationRepository,
    private readonly crypto: LineSecretCryptoPort,
    private readonly provider: LineConnectionTestPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    workspaceId: string;
    groupId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    callbackUrl: string;
  }) {
    const stored = await this.repository.getForTest(input);
    if (!stored) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    let result;
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
    await this.repository.recordTest({
      ...input,
      success: result.success,
      errorCategory: result.errorCategory,
    });
    return result;
  }
}

export class ActivateGroupLineConfiguration {
  constructor(private readonly repository: GroupLineConfigurationRepository) {}
  async execute(input: Parameters<GroupLineConfigurationRepository['activate']>[0]) {
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
    const value = await this.repository.activate({ ...input, reason });
    if (!value) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    return value;
  }
}

export class SetGroupLineRoutingPolicy {
  constructor(private readonly repository: GroupLineConfigurationRepository) {}
  async execute(input: Parameters<GroupLineConfigurationRepository['setPolicy']>[0]) {
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
    if ((input.mode === 'DEDICATED') !== input.pilotEnabled)
      throw new ApplicationError('VALIDATION_ERROR', 'dedicated mode requires pilot permission');
    const value = await this.repository.setPolicy({ ...input, reason });
    if (!value) throw new ApplicationError('FORBIDDEN', 'super admin required');
    return value;
  }
}
