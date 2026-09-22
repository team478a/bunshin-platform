import { ApplicationError } from '@bunshin/shared';

import { validateAdminReason } from './admin-configuration-validation';
import type { LineConfigurationEnvironment } from './configuration-environment';

export type AdminEmailConfigurationStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ERROR';
export interface AdminEmailConfiguration {
  id: string;
  environment: LineConfigurationEnvironment;
  version: number;
  status: AdminEmailConfigurationStatus;
  apiKeyMask: string;
  fromEmail: string;
  recipientEmails: string[];
  globallyPaused: boolean;
  keyVersion: number;
  lastVerifiedAt: Date | null;
  lastErrorCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface EncryptedAdminEmailApiKey {
  encryptedValue: string;
  mask: string;
  keyVersion: number;
}
export interface AdminEmailSecretCryptoPort {
  encrypt(value: string): EncryptedAdminEmailApiKey;
  decrypt(value: string): string;
}
export interface AdminEmailConnectionTestPort {
  sendTest(input: { apiKey: string; fromEmail: string; recipientEmails: string[] }): Promise<{
    success: boolean;
    errorCategory: string | null;
  }>;
}
export interface AdminEmailConfigurationRepository {
  list(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<AdminEmailConfiguration[] | null>;
  create(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    apiKey: EncryptedAdminEmailApiKey;
    fromEmail: string;
    recipientEmails: string[];
  }): Promise<AdminEmailConfiguration | null>;
  forTest(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
  }): Promise<{ configuration: AdminEmailConfiguration; encryptedApiKey: string } | null>;
  recordTest(input: {
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
  }): Promise<AdminEmailConfiguration | null>;
  pause(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
  }): Promise<AdminEmailConfiguration | null>;
  active(input: {
    environment: LineConfigurationEnvironment;
  }): Promise<{ configuration: AdminEmailConfiguration; encryptedApiKey: string } | null>;
  hasConfiguration(input: { environment: LineConfigurationEnvironment }): Promise<boolean>;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export class ListAdminEmailConfigurations {
  constructor(private readonly repository: AdminEmailConfigurationRepository) {}
  async execute(actorUserId: string, environment: LineConfigurationEnvironment) {
    const value = await this.repository.list({ actorUserId, environment });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return value;
  }
}
export class CreateAdminEmailConfiguration {
  constructor(
    private readonly repository: AdminEmailConfigurationRepository,
    private readonly crypto: AdminEmailSecretCryptoPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    reason: string;
    apiKey: string;
    fromEmail: string;
    recipientEmails: string[];
  }) {
    const reason = validateAdminReason(input.reason);
    const fromEmail = input.fromEmail.trim().toLowerCase();
    const recipientEmails = [
      ...new Set(input.recipientEmails.map((value) => value.trim().toLowerCase()).filter(Boolean)),
    ];
    if (
      !emailPattern.test(fromEmail) ||
      recipientEmails.length < 1 ||
      recipientEmails.length > 10 ||
      recipientEmails.some((value) => !emailPattern.test(value))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid email configuration');
    if (input.apiKey.trim().length < 16)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid API key');
    const value = await this.repository.create({
      ...input,
      reason,
      fromEmail,
      recipientEmails,
      apiKey: this.crypto.encrypt(input.apiKey.trim()),
    });
    if (value === null) throw new ApplicationError('FORBIDDEN', 'super admin required');
    return value;
  }
}
export class TestAdminEmailConfiguration {
  constructor(
    private readonly repository: AdminEmailConfigurationRepository,
    private readonly crypto: AdminEmailSecretCryptoPort,
    private readonly provider: AdminEmailConnectionTestPort,
  ) {}
  async execute(input: {
    actorUserId: string;
    configurationId: string;
    environment: LineConfigurationEnvironment;
  }) {
    const stored = await this.repository.forTest(input);
    if (stored === null) throw new ApplicationError('NOT_FOUND', 'configuration not found');
    let result: { success: boolean; errorCategory: string | null };
    try {
      result = await this.provider.sendTest({
        apiKey: this.crypto.decrypt(stored.encryptedApiKey),
        fromEmail: stored.configuration.fromEmail,
        recipientEmails: stored.configuration.recipientEmails,
      });
    } catch {
      result = { success: false, errorCategory: 'PROVIDER_UNAVAILABLE' };
    }
    await this.repository.recordTest({ ...input, ...result });
    return result;
  }
}
export class ActivateAdminEmailConfiguration {
  constructor(private readonly repository: AdminEmailConfigurationRepository) {}
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
export class PauseAdminEmailConfiguration {
  constructor(private readonly repository: AdminEmailConfigurationRepository) {}
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
