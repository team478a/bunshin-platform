import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './index';
import type { LineRecipientResolverPort } from './line-messaging-core';

export type LineFriendshipStatus = 'UNKNOWN' | 'FOLLOWING' | 'UNFOLLOWED';
export type LineWebhookEventType = 'FOLLOW' | 'UNFOLLOW' | 'OTHER';
export type LineWebhookEventOutcome =
  'APPLIED' | 'DUPLICATE' | 'IDENTITY_NOT_FOUND' | 'CONNECTION_NOT_FOUND' | 'IGNORED';

export interface LineConnection {
  id: string;
  environment: LineConfigurationEnvironment;
  workspaceId: string;
  userId: string;
  status: 'ACTIVE' | 'DISCONNECTED';
  friendshipStatus: LineFriendshipStatus;
  notificationConsentAt: Date | null;
  followedAt: Date | null;
  unfollowedAt: Date | null;
  lastWebhookAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LineConnectionRepository extends LineRecipientResolverPort {
  connect(input: {
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    actorUserId: string;
    providerUserId: string;
    consentGranted: boolean;
  }): Promise<LineConnection | null>;
  disconnect(input: {
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    actorUserId: string;
  }): Promise<boolean>;
  applyWebhook(input: {
    environment: LineConfigurationEnvironment;
    providerEventId: string;
    providerUserId: string | null;
    type: LineWebhookEventType;
    occurredAt: Date;
    processedAt: Date;
  }): Promise<LineWebhookEventOutcome>;
}

const providerValue = /^[\x21-\x7e]{1,255}$/;

export class ConnectLineMessagingAccount {
  constructor(private readonly repository: LineConnectionRepository) {}

  async execute(input: {
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    actorUserId: string;
    verifiedProviderUserId: string;
    consentGranted: boolean;
  }): Promise<LineConnection> {
    if (!providerValue.test(input.verifiedProviderUserId))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid verified LINE identity');
    const connection = await this.repository.connect({
      environment: input.environment,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      providerUserId: input.verifiedProviderUserId,
      consentGranted: input.consentGranted,
    });
    if (!connection)
      throw new ApplicationError('NOT_FOUND', 'verified LINE identity scope not found');
    return connection;
  }
}

export class DisconnectLineMessagingAccount {
  constructor(private readonly repository: LineConnectionRepository) {}

  async execute(input: {
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    actorUserId: string;
  }): Promise<void> {
    if (!(await this.repository.disconnect(input)))
      throw new ApplicationError('NOT_FOUND', 'LINE connection scope not found');
  }
}

export class ProcessLineWebhookEvents {
  constructor(
    private readonly repository: LineConnectionRepository,
    private readonly now = () => new Date(),
  ) {}

  async execute(input: {
    environment: LineConfigurationEnvironment;
    events: Array<{
      providerEventId: string;
      providerUserId: string | null;
      type: LineWebhookEventType;
      occurredAt: Date;
    }>;
  }): Promise<{ processed: number; outcomes: Record<LineWebhookEventOutcome, number> }> {
    if (input.events.length > 100)
      throw new ApplicationError('VALIDATION_ERROR', 'too many LINE webhook events');
    const outcomes: Record<LineWebhookEventOutcome, number> = {
      APPLIED: 0,
      DUPLICATE: 0,
      IDENTITY_NOT_FOUND: 0,
      CONNECTION_NOT_FOUND: 0,
      IGNORED: 0,
    };
    for (const event of input.events) {
      if (!providerValue.test(event.providerEventId))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE webhook event id');
      if (event.providerUserId !== null && !providerValue.test(event.providerUserId))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE webhook source');
      if (Number.isNaN(event.occurredAt.getTime()))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE webhook timestamp');
      const outcome = await this.repository.applyWebhook({
        ...event,
        environment: input.environment,
        processedAt: this.now(),
      });
      outcomes[outcome] += 1;
    }
    return { processed: input.events.length, outcomes };
  }
}
